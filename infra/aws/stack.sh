#!/usr/bin/env bash
# Crea o actualiza el stack de un entorno con infra/aws/cursus.yml.
#
#   bash infra/aws/stack.sh <staging|production>            # aplica los cambios
#   bash infra/aws/stack.sh <staging|production> --dry-run  # solo muestra qué cambiaría
#   bash infra/aws/stack.sh <staging|production> [--dry-run] <tag>   # fuerza una imagen
#
# Sin etiqueta usa la imagen actual del servicio, o la última de ECR si aún no
# hay servicio. La primera vez (sin imágenes en ECR) crea todo menos el servicio
# de ECS; después del primer deploy del workflow, correrlo de nuevo lo crea.
source "$(dirname "$0")/common.sh"
use_environment "${1:-}"
shift
TEMPLATE="$(dirname "$0")/cursus.yml"

DRY_RUN=false
if [ "${1:-}" = --dry-run ]; then
  DRY_RUN=true
  shift
fi

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
[ "$VPC" != None ] || fail "No hay VPC por defecto en $AWS_REGION."
SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC" Name=default-for-az,Values=true \
  --query 'Subnets[].SubnetId' --output text | tr '\t' ',')

TAG=${1:-$(service_image)}
TAG=${TAG:-$(latest_image)}

PARAMETERS=("Entorno=$ENVIRONMENT" "VpcId=$VPC" "SubnetIds=$SUBNETS" "ImageTag=$TAG")

STACK_EXISTS=false
if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  STACK_EXISTS=true
  # Sin imagen, CloudFormation borraría el servicio: se evita.
  if [ -z "$TAG" ] && [ -n "$(stack_output ImageTag)" ]; then
    fail "No se encontró la imagen actual del servicio. Pasa una etiqueta: bash $0 $ENVIRONMENT <tag>"
  fi
fi

if [ "$DRY_RUN" = true ]; then
  [ "$STACK_EXISTS" = true ] || fail "--dry-run solo sirve para un stack que ya existe."
  info "Revisando cambios en $STACK (imagen: ${TAG:-ninguna}). No se aplica nada."
  # Los parámetros que no se pasan conservan su valor actual, igual que en un deploy.
  PARAMETERS_FILE=$(mktemp)
  trap 'rm -f "$PARAMETERS_FILE"' EXIT
  CURRENT=$(aws cloudformation describe-stacks --stack-name "$STACK" \
    --query 'Stacks[0].Parameters[].ParameterKey' --output text)
  jq -n --arg current "$CURRENT" '
    ($ARGS.positional | map(split("=") | {ParameterKey: .[0], ParameterValue: (.[1:] | join("="))})) as $given
    | $given + [($current | split("\t")[] | select(. != "")) as $key
        | select(($given | map(.ParameterKey) | index($key)) == null)
        | {ParameterKey: $key, UsePreviousValue: true}]' \
    --args "${PARAMETERS[@]}" >"$PARAMETERS_FILE"
  CHANGE_SET="revision-$(date +%s)"
  aws cloudformation create-change-set --stack-name "$STACK" --change-set-name "$CHANGE_SET" \
    --template-body "file://$TEMPLATE" --capabilities CAPABILITY_NAMED_IAM \
    --parameters "file://$PARAMETERS_FILE" >/dev/null
  if aws cloudformation wait change-set-create-complete --stack-name "$STACK" \
    --change-set-name "$CHANGE_SET" 2>/dev/null; then
    info "Cambios que se aplicarían (Replacement=True significa que AWS borra y crea de nuevo):"
    aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CHANGE_SET" \
      --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' \
      --output table
  else
    aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CHANGE_SET" \
      --query StatusReason --output text
  fi
  aws cloudformation delete-change-set --stack-name "$STACK" --change-set-name "$CHANGE_SET"
  exit 0
fi

if [ "$STACK_EXISTS" = true ]; then
  info "Actualizando el stack $STACK (imagen: ${TAG:-ninguna})"
else
  info "Creando el stack $STACK (tarda unos 15 minutos por la base de datos)"
fi

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file "$TEMPLATE" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMETERS[@]}"

info "Listo. Salidas del stack:"
aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table

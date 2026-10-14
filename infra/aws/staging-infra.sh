#!/usr/bin/env bash
# Crea o actualiza el stack de staging con infra/aws/staging.yml.
#
#   bash infra/aws/staging-infra.sh          # usa la imagen actual del servicio,
#                                            # o la última de ECR si aún no hay servicio
#   bash infra/aws/staging-infra.sh <tag>    # fuerza una imagen
#
# La primera vez (sin imágenes en ECR) crea todo menos el servicio de ECS.
# Después del primer deploy del workflow, correrlo de nuevo crea el servicio.
source "$(dirname "$0")/comun.sh"
PLANTILLA="$(dirname "$0")/staging.yml"

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
[ "$VPC" != None ] || error "No hay VPC por defecto en $AWS_REGION."
SUBREDES=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC" Name=default-for-az,Values=true \
  --query 'Subnets[].SubnetId' --output text | tr '\t' ',')

TAG=${1:-$(imagen_del_servicio)}
TAG=${TAG:-$(ultima_imagen)}

PARAMETROS=("VpcId=$VPC" "SubnetIds=$SUBREDES" "ImageTag=$TAG")

if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  # Sin imagen, CloudFormation borraría el servicio: se evita.
  if [ -z "$TAG" ] && [ -n "$(salida ImageTag)" ]; then
    error "No se encontró la imagen actual del servicio. Pasa una etiqueta: bash $0 <tag>"
  fi
  info "Actualizando el stack $STACK (imagen: ${TAG:-ninguna})"
else
  # El proveedor OIDC de GitHub solo puede existir una vez por cuenta.
  if aws iam list-open-id-connect-providers --output text |
    grep -q token.actions.githubusercontent.com; then
    PARAMETROS+=("CrearProveedorOidc=false")
  fi
  info "Creando el stack $STACK (tarda unos 15 minutos por la base de datos)"
fi

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file "$PLANTILLA" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMETROS[@]}"

info "Listo. Salidas del stack:"
aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table

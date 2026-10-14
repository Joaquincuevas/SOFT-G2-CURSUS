// Instala los hooks de git con husky (script prepare del package.json raíz).
// Se omite en Vercel, en el CI y en instalaciones de producción, donde no hay
// commits que validar. Recomendación de husky v9:
// https://typicode.github.io/husky/how-to.html#ci-server-and-docker

// CI cuenta como activo con cualquier valor salvo vacío, "false" o "0"
// (GitHub Actions usa CI=true; otros servicios, CI=1).
const ci = (process.env.CI ?? '').trim().toLowerCase()
const enCi = ci !== '' && ci !== 'false' && ci !== '0'

if (process.env.VERCEL || enCi || process.env.NODE_ENV === 'production') {
  process.exit(0)
}

try {
  const husky = (await import('husky')).default
  const mensaje = husky()
  if (mensaje) console.log(mensaje)
} catch (error) {
  // Avisa sin romper la instalación (por ejemplo, husky no está con --omit=dev)
  console.warn(`husky no se instaló: ${error.message}`)
  process.exit(0)
}

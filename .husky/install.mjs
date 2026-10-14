// Instala los hooks de git con husky (script prepare del package.json raíz).
// Se omite en Vercel, en el CI y en instalaciones de producción, donde no hay
// commits que validar. Recomendación de husky v9:
// https://typicode.github.io/husky/how-to.html#ci-server-and-docker
if (
  process.env.VERCEL ||
  process.env.CI ||
  process.env.NODE_ENV === 'production'
) {
  process.exit(0)
}

try {
  const husky = (await import('husky')).default
  const mensaje = husky()
  if (mensaje) console.log(mensaje)
} catch {
  // husky no está instalado (por ejemplo, con --omit=dev): no rompe la instalación
  process.exit(0)
}

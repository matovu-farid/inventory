import fs from 'node:fs'
import path from 'node:path'

const distRoot = path.resolve('dist')
const clientRoot = path.join(distRoot, 'client')
const serverRoot = path.join(distRoot, 'server')

function filesUnder(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...filesUnder(filePath))
    else if (entry.isFile()) files.push(filePath)
  }
  return files
}

const clientFiles = filesUnder(clientRoot)
if (clientFiles.length === 0) {
  console.error(`No client artifacts found under ${clientRoot}`)
  process.exit(1)
}

const forbidden =
  /RESEND_API_KEY|REQUEST_ACCESS_EMAIL|matovu90\.gmail\.com|process\.env|request-access\.server|new\s+Resend\b|resend\.emails|@resend\//i
const clientLeaks = []
for (const filePath of clientFiles) {
  const contents = fs.readFileSync(filePath, 'utf8')
  if (forbidden.test(contents)) clientLeaks.push(filePath)
}
if (clientLeaks.length > 0) {
  console.error(
    'Forbidden request-access server content found in client artifacts:',
  )
  console.error(clientLeaks.join('\n'))
  process.exit(1)
}

const serverFiles = filesUnder(serverRoot)
const serverManifest = serverFiles.find((filePath) => {
  const contents = fs.readFileSync(filePath, 'utf8')
  return (
    contents.includes('request-access') &&
    contents.includes('REQUEST_ACCESS_RATE_LIMITER')
  )
})
if (!serverManifest) {
  console.error(
    `Could not locate a server manifest containing the request-access route and limiter binding under ${serverRoot}`,
  )
  process.exit(1)
}

console.log(
  `Checked ${clientFiles.length} client artifacts under ${clientRoot}`,
)
console.log(`Checked server manifest ${serverManifest}`)

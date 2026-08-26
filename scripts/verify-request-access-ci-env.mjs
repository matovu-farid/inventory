import fs from 'node:fs'
import path from 'node:path'

const workflowPath = path.resolve('.github/workflows/ci.yml')
const workflow = fs.readFileSync(workflowPath, 'utf8')
const jobMatches = [...workflow.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)]
const jobs = new Map(
  jobMatches.map((match, index) => [
    match[1],
    workflow.slice(
      match.index,
      jobMatches[index + 1]?.index ?? workflow.length,
    ),
  ]),
)

const requiredJobs = ['test', 'e2e', 'build', 'deploy']
const failures = []

for (const jobName of requiredJobs) {
  const job = jobs.get(jobName)
  if (!job) {
    failures.push(`${jobName}: job is missing`)
    continue
  }
  if (!/REQUEST_ACCESS_EMAIL:\s+matovu90@gmail\.com\b/.test(job)) {
    failures.push(`${jobName}: REQUEST_ACCESS_EMAIL is missing`)
  }
  if (
    ['test', 'e2e'].includes(jobName) &&
    !/MOCK_EMAILS:\s*['"]?true/.test(job)
  ) {
    failures.push(`${jobName}: MOCK_EMAILS=true is missing`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(
  `CI request-access environment verified for: ${requiredJobs.join(', ')}`,
)

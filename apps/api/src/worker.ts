import { processGuard } from './process-guard.js'
import { readConfig } from './config.js'
import { openDatabase,checkDatabase } from './database.js'
import { ExecutionWorker } from './execution-worker.js'
import { ChatWorker } from './chat-worker.js'
import { OpenImWorker } from './openim-worker.js'
import { PersonalFollowupWorker } from './personal-followups.js'
import { CommunityCatalogWorker } from './community-catalog.js'
import { TaskSupportWorker } from './task-support.js'
import { waitForWorkerDatabase, workerStep } from './worker-database.js'
const config=readConfig()
const releaseProcess=processGuard(config.databasePath);process.once('exit',releaseProcess)
const db=openDatabase(config.databasePath)
// Yield during competing API writes instead of blocking lease timers for 2s.
db.exec('PRAGMA busy_timeout=50')
await waitForWorkerDatabase(() => checkDatabase(db))
let stopping=false
const catalogWorker=new CommunityCatalogWorker(db,config)
let catalogFlight:Promise<unknown>|undefined
const stop=()=>{stopping=true;catalogWorker.close()}
process.once('SIGINT',stop);process.once('SIGTERM',stop)
const worker=new ExecutionWorker(db,config)
const chatWorker=new ChatWorker(db,config)
const imWorker=new OpenImWorker(db,config)
const followupWorker=new PersonalFollowupWorker(db,config)
const supportWorker=new TaskSupportWorker(db,config)
console.log('B3 worker started; explicit support requests enabled; historical notification kinds remain dormant.')
try {
  do {
    if (!catalogFlight && !stopping) catalogFlight = catalogWorker.tick().catch(() => {
      console.error('Community catalog synchronization failed; prior catalog preserved.')
    }).finally(() => { catalogFlight = undefined })
    const support = await workerStep('SUPPORT', () => supportWorker.tick())
    const reminder = await workerStep('FOLLOWUP', () => followupWorker.tick())
    const chat = await workerStep('CHAT', () => chatWorker.tick())
    const execution = await workerStep('EXECUTION', () => worker.tick())
    const im = await workerStep('IM', () => imWorker.tick())
    if (!support && !reminder && !chat && !execution && !im) await new Promise(resolve => setTimeout(resolve, 1000))
  } while (!stopping && !process.argv.includes('--once'))
} finally { catalogWorker.close(); await catalogFlight; db.close() }

import { createRoot } from 'react-dom/client'
import sampleUrl from './assets/sample.litematic?url'
import { AppController } from './ui/app/controller'
import { App } from './ui/App'
import { browserServices } from './ui/browserServices'
import { sampleSlot } from './ui/sample'
import './ui/styles.css'

const controller = new AppController(browserServices())
createRoot(document.getElementById('root')!).render(<App controller={controller} sample={sampleSlot(sampleUrl)} />)

/** Ontwerppreview (alleen dev): http://localhost:5173/preview.html?theme=dark&page=collectie */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Preview } from './Preview'
import '../index.css'
import '../App.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  )
}

import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { HomePage } from '@/pages/HomePage'
import { TranscriptionPage } from '@/pages/TranscriptionPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/transcribe" element={<TranscriptionPage />} />
      </Routes>
    </Layout>
  )
}

export default App

import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DepartmentSelectPage from './DepartmentSelectPage'
import { DEPARTMENTS, type DepartmentKey } from './departments'
import './index.css'

function DashboardRoot() {
  const [departmentKey, setDepartmentKey] = useState<DepartmentKey | null>(null)
  if (!departmentKey) return <DepartmentSelectPage onSelect={setDepartmentKey} />
  return <App key={departmentKey} department={DEPARTMENTS[departmentKey]} onSwitchDepartment={() => setDepartmentKey(null)} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DashboardRoot />
  </React.StrictMode>,
)
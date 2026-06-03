import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100dvh', background: '#0a0a0f',
        color: '#fff', padding: '24px', textAlign: 'center', gap: '16px',
      }}>
        <div style={{ fontSize: '48px' }}>⚠️</div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>Etwas ist schiefgelaufen</div>
        <div style={{ fontSize: '14px', color: '#666', maxWidth: '320px' }}>
          {this.state.error?.message ?? 'Unbekannter Fehler'}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            marginTop: '8px', padding: '12px 24px', borderRadius: '12px',
            background: '#7B61FF', color: '#fff', border: 'none',
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Erneut versuchen
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px', borderRadius: '12px',
            background: 'transparent', color: '#666', border: '1px solid #333',
            fontSize: '14px', cursor: 'pointer',
          }}
        >
          Seite neu laden
        </button>
      </div>
    )
  }
}

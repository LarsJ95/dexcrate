import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Bij een andere waarde (bv. andere pagina) begint de grens opnieuw. */
  resetKey?: string
}

interface State {
  error: Error | null
  resetKey: string | undefined
}

/** Pagina-onderdeel kon niet worden opgehaald: offline of een nieuwe versie staat online. */
function isChunkError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)
}

/** Vangt fouten tijdens het tekenen, zodat de app niet als wit scherm achterblijft. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Onderdeel van de app gecrasht', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return <ErrorScreen error={error} onRetry={() => this.setState({ error: null })} />
  }
}

function ErrorScreen({ error, onRetry }: { error: Error; onRetry: () => void }): JSX.Element {
  const chunk = isChunkError(error)
  return (
    <section className="page" role="alert">
      <h1>Something went wrong</h1>
      <p className="error">
        {chunk ? 'This page could not be loaded. Check your connection or reload the app.' : error.message || 'Unknown error.'}
      </p>
      <div className="settings-actions">
        <button type="button" className="primary small-btn" onClick={() => window.location.reload()}>
          Reload
        </button>
        {!chunk && (
          <button type="button" className="ghost small-btn" onClick={onRetry}>
            Try again
          </button>
        )}
        <button
          type="button"
          className="ghost small-btn"
          onClick={() => {
            window.location.hash = '#/overview'
            onRetry()
          }}
        >
          Go to Overview
        </button>
      </div>
    </section>
  )
}

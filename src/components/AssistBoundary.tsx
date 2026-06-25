// A v1-core error boundary that swallows any error from the OPTIONAL assist
// subtree, so v1 is never affected by it. Lives in core (not src/assist/) on
// purpose: the assist layer is OFF by default (assistAvailable() is false) and is
// code-split into its own lazy chunk, reached only through guarded dynamic imports
// that fall back to a null component if the chunk fails to load. This boundary is
// the runtime backstop, so v1 stays fully functional and offline-safe without
// assist. Shared by every place that mounts an assist surface.

import { Component, type ReactNode } from 'react'

export class AssistBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

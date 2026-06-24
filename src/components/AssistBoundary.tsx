// A v1-core error boundary that swallows any error from the OPTIONAL assist
// subtree, so v1 is never affected by it. Lives in core (not src/assist/) on
// purpose: deleting src/assist/ must leave v1 building, and the dynamic imports
// that load assist already fall back to a null component. Shared by every place
// that mounts an assist surface.

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

/// <reference types="vite/client" />

declare global {
  namespace JSX {
    type Element = import('react').JSX.Element
  }
}

export {}

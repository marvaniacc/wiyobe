// Global type augmentations for third-party scripts loaded at runtime.

interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: { credential: string }) => void
    [key: string]: unknown
  }): void
  prompt(): void
  [key: string]: unknown
}

interface GoogleAccounts {
  id: GoogleAccountsId
  [key: string]: unknown
}

interface GoogleNamespace {
  accounts: GoogleAccounts
  [key: string]: unknown
}

interface Window {
  google?: GoogleNamespace
}

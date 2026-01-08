/**
 * Get the backend API URL
 * Works in both client and server components
 */
export function getBackendUrl(): string {
  // In browser/client
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_BACKEND_URL || window.location.origin.replace(':3000', ':8000')
  }
  
  // In server
  return process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:8000'
}

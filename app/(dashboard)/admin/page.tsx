"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getBackendUrl } from '@/lib/api'
import SparklineChart from '@/components/SparklineChart'

interface User {
  id: string
  email: string
  full_name: string | null
  role: string
  status: string
  has_limits: boolean
  max_books: number | null
  max_pages_per_month: number | null
  max_chat_messages_per_month: number | null
  current_books_count: number
  pages_processed_this_month: number
  chat_messages_this_month: number
  created_at: string
  approved_at: string | null
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('pending')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showLimitsModal, setShowLimitsModal] = useState(false)
  const [limitsForm, setLimitsForm] = useState({
    has_limits: true,
    max_books: '',
    max_pages_per_month: '',
    max_chat_messages_per_month: ''
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (!profile || (profile as any).role !== 'admin') {
          router.push('/dashboard')
        }
      } catch (error) {
        console.error('Error checking admin access:', error)
        router.push('/dashboard')
      }
    }

    const loadUsersData = async () => {
      try {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          throw new Error('Not authenticated')
        }

        const backendUrl = getBackendUrl()

        const allResponse = await fetch(`${backendUrl}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (allResponse.ok) {
          const allData = await allResponse.json()
          setUsers(allData.users || [])
        }
      } catch (error: any) {
        setError(error.message || 'Failed to load users')
      } finally {
        setLoading(false)
      }
    }

    checkAccess()
    loadUsersData()
  }, [supabase, router])

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const backendUrl = getBackendUrl()

      if (currentStatus === 'pending') {
        // Approve
        const response = await fetch(`${backendUrl}/api/admin/users/${userId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            has_limits: true,
            max_books: null,
            max_pages_per_month: null,
            max_chat_messages_per_month: null
          })
        })

        if (response.ok) {
          // Reload users
          const reloadResponse = await fetch(`${backendUrl}/api/admin/users`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })
          if (reloadResponse.ok) {
            const allData = await reloadResponse.json()
            setUsers(allData.users || [])
          }
        }
      } else if (currentStatus === 'approved') {
        // Suspend
        const response = await fetch(`${backendUrl}/api/admin/users/${userId}/suspend`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (response.ok) {
          const reloadResponse = await fetch(`${backendUrl}/api/admin/users`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })
          if (reloadResponse.ok) {
            const allData = await reloadResponse.json()
            setUsers(allData.users || [])
          }
        }
      } else if (currentStatus === 'suspended') {
        // Re-approve (approve again)
        const response = await fetch(`${backendUrl}/api/admin/users/${userId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            has_limits: true,
            max_books: null,
            max_pages_per_month: null,
            max_chat_messages_per_month: null
          })
        })

        if (response.ok) {
          const reloadResponse = await fetch(`${backendUrl}/api/admin/users`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })
          if (reloadResponse.ok) {
            const allData = await reloadResponse.json()
            setUsers(allData.users || [])
          }
        }
      }
    } catch (error) {
      console.error('Error toggling status:', error)
    }
  }

  const handleReject = async (userId: string) => {
    if (!confirm('Are you sure you want to reject this user?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const backendUrl = getBackendUrl()

      const response = await fetch(`${backendUrl}/api/admin/users/${userId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const reloadResponse = await fetch(`${backendUrl}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
        if (reloadResponse.ok) {
          const allData = await reloadResponse.json()
          setUsers(allData.users || [])
        }
      }
    } catch (error) {
      console.error('Error rejecting user:', error)
    }
  }

  const openLimitsModal = (user: User) => {
    setSelectedUser(user)
    setLimitsForm({
      has_limits: user.has_limits,
      max_books: user.max_books?.toString() || '',
      max_pages_per_month: user.max_pages_per_month?.toString() || '',
      max_chat_messages_per_month: user.max_chat_messages_per_month?.toString() || ''
    })
    setShowLimitsModal(true)
  }

  const handleUpdateLimits = async () => {
    if (!selectedUser) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const backendUrl = getBackendUrl()

      const response = await fetch(`${backendUrl}/api/admin/users/${selectedUser.id}/limits`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          has_limits: limitsForm.has_limits,
          max_books: limitsForm.max_books ? parseInt(limitsForm.max_books) : null,
          max_pages_per_month: limitsForm.max_pages_per_month ? parseInt(limitsForm.max_pages_per_month) : null,
          max_chat_messages_per_month: limitsForm.max_chat_messages_per_month ? parseInt(limitsForm.max_chat_messages_per_month) : null
        })
      })

      if (response.ok) {
        setShowLimitsModal(false)
        setSelectedUser(null)
        const reloadResponse = await fetch(`${backendUrl}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
        if (reloadResponse.ok) {
          const allData = await reloadResponse.json()
          setUsers(allData.users || [])
        }
      } else {
        const errorData = await response.json()
        alert(errorData.detail || 'Failed to update limits')
      }
    } catch (error) {
      console.error('Error updating limits:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'badge-emerald'
      case 'pending':
        return 'badge-amber'
      case 'rejected':
        return 'badge-rose'
      case 'suspended':
        return 'badge-violet'
      default:
        return 'badge-violet'
    }
  }

  // Generate mock sparkline data (7 days)
  const generateSparklineData = (baseValue: number) => {
    return Array.from({ length: 7 }, (_, i) => {
      const variation = Math.random() * 0.3 - 0.15 // ±15% variation
      return Math.max(0, Math.round(baseValue * (1 + variation)))
    })
  }

  const filteredUsers = users.filter(user => {
    if (activeFilter === 'all') return true
    return user.status === activeFilter
  })

  const stats = {
    total: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'approved').length,
    totalBooks: users.reduce((sum, u) => sum + (u.current_books_count || 0), 0)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-50 mb-1">Mission Control</h1>
        <p className="text-sm text-zinc-400">Manage users and system settings</p>
      </div>

      {/* Stats Bar */}
      <div className="h-10 border-b border-zinc-800 bg-zinc-900/50 flex items-center px-6">
        <div className="flex items-center gap-6 text-xs font-mono text-zinc-400">
          <span>
            <span className="text-violet-400">Total:</span> {stats.total} Users
          </span>
          <span>
            <span className="text-amber-400">Pending:</span> {stats.pending}
          </span>
          <span>
            <span className="text-emerald-400">Approved:</span> {stats.approved}
          </span>
          <span>
            <span className="text-zinc-400">Books:</span> {stats.totalBooks}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6">
        <div className="flex gap-1">
          {(['all', 'pending', 'approved', 'suspended'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`
                px-4 py-2 text-sm font-medium transition-colors
                ${activeFilter === filter
                  ? 'text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-zinc-400 hover:text-zinc-200'
                }
              `}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
              {filter !== 'all' && (
                <span className="ml-2 text-xs font-mono">
                  ({users.filter(u => u.status === filter).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          </div>
        ) : error ? (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 mx-6 mt-6">
            <p className="text-sm font-medium text-rose-400">{error}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-12 text-center mx-6 mt-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-800 mb-4">
              <span className="text-2xl">👥</span>
            </div>
            <h3 className="text-lg font-semibold text-zinc-50 mb-2">No users found</h3>
            <p className="text-sm text-zinc-400">
              {activeFilter === 'pending' ? 'No users pending approval' : `No ${activeFilter} users`}
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30 mx-6 mt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-900/50 border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Limits
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-zinc-400">
                              {(user.full_name || user.email)[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-semibold text-zinc-50">
                              {user.full_name || 'No name'}
                            </div>
                            <div className="text-sm text-zinc-400 font-mono">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(user.status)}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <SparklineChart
                            data={generateSparklineData(user.pages_processed_this_month || 0)}
                            color="emerald"
                          />
                          <div className="text-xs font-mono text-zinc-500">
                            {user.current_books_count || 0} books | {user.chat_messages_this_month || 0} msgs
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-zinc-400">
                          {user.has_limits ? (
                            <div className="font-mono text-xs">
                              <div>B: {user.max_books || '∞'}</div>
                              <div>P: {user.max_pages_per_month || '∞'}</div>
                              <div>M: {user.max_chat_messages_per_month || '∞'}</div>
                            </div>
                          ) : (
                            <span className="text-emerald-400 font-medium">No limits</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {user.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleToggleStatus(user.id, 'pending')}
                                className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 rounded hover:bg-emerald-500/30 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(user.id)}
                                className="px-3 py-1.5 text-xs font-medium text-rose-400 bg-rose-500/20 border border-rose-500/30 rounded hover:bg-rose-500/30 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {user.status === 'approved' && (
                            <>
                              <button
                                onClick={() => openLimitsModal(user)}
                                className="px-3 py-1.5 text-xs font-medium text-violet-400 bg-violet-500/20 border border-violet-500/30 rounded hover:bg-violet-500/30 transition-colors"
                              >
                                Limits
                              </button>
                              <button
                                onClick={() => handleToggleStatus(user.id, 'approved')}
                                className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/20 border border-amber-500/30 rounded hover:bg-amber-500/30 transition-colors"
                              >
                                Suspend
                              </button>
                            </>
                          )}
                          {user.status === 'suspended' && (
                            <button
                              onClick={() => handleToggleStatus(user.id, 'suspended')}
                              className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 rounded hover:bg-emerald-500/30 transition-colors"
                            >
                              Re-activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Limits Modal */}
      {showLimitsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-50">Set Usage Limits</h3>
              <p className="mt-1 text-sm text-zinc-400 font-mono">{selectedUser.email}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="has_limits"
                  checked={limitsForm.has_limits}
                  onChange={(e) => setLimitsForm({ ...limitsForm, has_limits: e.target.checked })}
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-zinc-700 rounded bg-zinc-800"
                />
                <label htmlFor="has_limits" className="ml-2 text-sm font-medium text-zinc-300">
                  Enable usage limits
                </label>
              </div>

              {limitsForm.has_limits && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Max Books
                    </label>
                    <input
                      type="number"
                      value={limitsForm.max_books}
                      onChange={(e) => setLimitsForm({ ...limitsForm, max_books: e.target.value })}
                      placeholder="Leave empty for unlimited"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Max Pages per Month
                    </label>
                    <input
                      type="number"
                      value={limitsForm.max_pages_per_month}
                      onChange={(e) => setLimitsForm({ ...limitsForm, max_pages_per_month: e.target.value })}
                      placeholder="Leave empty for unlimited"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Max Chat Messages per Month
                    </label>
                    <input
                      type="number"
                      value={limitsForm.max_chat_messages_per_month}
                      onChange={(e) => setLimitsForm({ ...limitsForm, max_chat_messages_per_month: e.target.value })}
                      placeholder="Leave empty for unlimited"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-zinc-800 flex gap-3">
              <button
                onClick={() => {
                  setShowLimitsModal(false)
                  setSelectedUser(null)
                }}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateLimits}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
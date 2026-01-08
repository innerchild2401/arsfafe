"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBackendUrl } from '@/lib/api'

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
  const [pendingUsers, setPendingUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('pending')
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

        // Load all users
        const allResponse = await fetch(`${backendUrl}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (allResponse.ok) {
          const allData = await allResponse.json()
          setUsers(allData.users || [])
        }

        // Load pending users
        const pendingResponse = await fetch(`${backendUrl}/api/admin/users/pending`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (pendingResponse.ok) {
          const pendingData = await pendingResponse.json()
          setPendingUsers(pendingData.users || [])
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


  const handleApprove = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const backendUrl = getBackendUrl()

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
        const pendingResponse = await fetch(`${backendUrl}/api/admin/users/pending`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
        if (pendingResponse.ok) {
          const pendingData = await pendingResponse.json()
          setPendingUsers(pendingData.users || [])
        }
      } else {
        const errorData = await response.json()
        alert(errorData.detail || 'Failed to approve user')
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to approve user')
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
        const pendingResponse = await fetch(`${backendUrl}/api/admin/users/pending`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
        if (pendingResponse.ok) {
          const pendingData = await pendingResponse.json()
          setPendingUsers(pendingData.users || [])
        }
      }
    } catch (error) {
      alert('Failed to reject user')
    }
  }

  const handleSuspend = async (userId: string) => {
    if (!confirm('Are you sure you want to suspend this user?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const backendUrl = getBackendUrl()

      const response = await fetch(`${backendUrl}/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
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
        const pendingResponse = await fetch(`${backendUrl}/api/admin/users/pending`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
        if (pendingResponse.ok) {
          const pendingData = await pendingResponse.json()
          setPendingUsers(pendingData.users || [])
        }
      }
    } catch (error) {
      alert('Failed to suspend user')
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
        const pendingResponse = await fetch(`${backendUrl}/api/admin/users/pending`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
        if (pendingResponse.ok) {
          const pendingData = await pendingResponse.json()
          setPendingUsers(pendingData.users || [])
        }
      } else {
        const errorData = await response.json()
        alert(errorData.detail || 'Failed to update limits')
      }
    } catch (error) {
      alert('Failed to update limits')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'suspended':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const displayUsers = activeTab === 'pending' ? pendingUsers : users

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 mb-4"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">Admin Panel</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">Manage users and system settings</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{users.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                <p className="mt-2 text-2xl font-semibold text-yellow-600">{pendingUsers.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Approved Users</p>
                <p className="mt-2 text-2xl font-semibold text-green-600">
                  {users.filter(u => u.status === 'approved').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Books</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {users.reduce((sum, u) => sum + (u.current_books_count || 0), 0)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-4 sm:space-x-8">
              <button
                onClick={() => setActiveTab('pending')}
                className={`py-3 px-1 sm:px-4 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'pending'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Pending ({pendingUsers.length})
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`py-3 px-1 sm:px-4 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'all'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                All Users ({users.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">No users found</h3>
            <p className="mt-2 text-sm text-gray-600">
              {activeTab === 'pending' ? 'No users pending approval' : 'No users in the system'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4">
              {displayUsers.map((user) => (
                <div key={user.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-gray-700">
                          {(user.full_name || user.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {user.full_name || 'No name'}
                        </div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(user.status)}`}>
                      {user.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-gray-600">Books</p>
                      <p className="font-semibold text-gray-900">{user.current_books_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Pages</p>
                      <p className="font-semibold text-gray-900">{user.pages_processed_this_month || 0}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    {user.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(user.id)}
                          className="flex-1 min-w-[100px] px-3 py-2 rounded-md text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(user.id)}
                          className="flex-1 min-w-[100px] px-3 py-2 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {user.status === 'approved' && (
                      <>
                        <button
                          onClick={() => openLimitsModal(user)}
                          className="flex-1 min-w-[100px] px-3 py-2 rounded-md text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          Limits
                        </button>
                        <button
                          onClick={() => handleSuspend(user.id)}
                          className="flex-1 min-w-[100px] px-3 py-2 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          Suspend
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Usage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Limits
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-semibold text-gray-700">
                                {(user.full_name || user.email)[0].toUpperCase()}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-semibold text-gray-900">
                                {user.full_name || 'No name'}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(user.status)}`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <div>Books: <span className="font-semibold">{user.current_books_count || 0}</span></div>
                            <div className="text-xs text-gray-500">
                              Pages: {user.pages_processed_this_month || 0} | Messages: {user.chat_messages_this_month || 0}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {user.has_limits ? (
                              <>
                                <div>Books: {user.max_books || '∞'}</div>
                                <div className="text-xs text-gray-500">
                                  Pages: {user.max_pages_per_month || '∞'} | Messages: {user.max_chat_messages_per_month || '∞'}
                                </div>
                              </>
                            ) : (
                              <span className="text-blue-600 font-medium">No limits</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex gap-2 justify-end">
                            {user.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(user.id)}
                                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(user.id)}
                                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {user.status === 'approved' && (
                              <>
                                <button
                                  onClick={() => openLimitsModal(user)}
                                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                                >
                                  Limits
                                </button>
                                <button
                                  onClick={() => handleSuspend(user.id)}
                                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                                >
                                  Suspend
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Limits Modal */}
        {showLimitsModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Set Usage Limits</h3>
                <p className="mt-1 text-sm text-gray-600">{selectedUser.email}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="has_limits"
                    checked={limitsForm.has_limits}
                    onChange={(e) => setLimitsForm({ ...limitsForm, has_limits: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="has_limits" className="ml-2 text-sm font-medium text-gray-900">
                    Enable usage limits
                  </label>
                </div>

                {limitsForm.has_limits && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Books
                      </label>
                      <input
                        type="number"
                        value={limitsForm.max_books}
                        onChange={(e) => setLimitsForm({ ...limitsForm, max_books: e.target.value })}
                        placeholder="Leave empty for unlimited"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Pages per Month
                      </label>
                      <input
                        type="number"
                        value={limitsForm.max_pages_per_month}
                        onChange={(e) => setLimitsForm({ ...limitsForm, max_pages_per_month: e.target.value })}
                        placeholder="Leave empty for unlimited"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Chat Messages per Month
                      </label>
                      <input
                        type="number"
                        value={limitsForm.max_chat_messages_per_month}
                        onChange={(e) => setLimitsForm({ ...limitsForm, max_chat_messages_per_month: e.target.value })}
                        placeholder="Leave empty for unlimited"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-gray-200 flex gap-3">
                <button
                  onClick={() => {
                    setShowLimitsModal(false)
                    setSelectedUser(null)
                  }}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateLimits}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import { useEffect, useRef } from "react"
import toast from "react-hot-toast"
import { initializeSocket } from "@/lib/socketClient"

const NOTIFICATION_MESSAGES = {
    pendingStores: 'New store submitted for approval',
    pendingProducts: 'New product submitted for approval',
    pendingPaymentProofs: 'New payment proof submitted',
    newOrders: 'New order placed',
    unreadChatMessages: 'New chat message received',
    invoiceRequest: 'A customer has requested a payment invoice',
}

const emitBrowserNotification = (title, body) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    try {
        new Notification(title, { body })
    } catch (error) {
        console.error('Browser notification error:', error)
    }
}

const AdminNotificationWatcher = () => {
    const { getToken } = useAuth()
    const lastToastAtRef = useRef(0)

    const fetchCounts = async () => {
        const token = await getToken()
        const { data } = await axios.get('/api/admin/dashboard', {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })

        const nextCounts = {
            pendingStores: data.pendingStores || 0,
            pendingProducts: data.pendingProducts || 0,
            pendingPaymentProofs: data.pendingPaymentProofs || 0,
            newOrders: data.newOrders || 0,
            unreadChatMessages: data.unreadChatMessages || 0,
            pendingInvoiceRequests: data.pendingInvoiceRequests || 0,
        }
        window.dispatchEvent(new CustomEvent('admin:counts-updated', { detail: nextCounts }))
    }

    useEffect(() => {
        let socket = null
        let interval = null
        let active = true

        const startRealtime = async () => {
            try {
                const token = await getToken()
                if (!active || !token) return

                socket = initializeSocket(token)

                if (socket) {
                    socket.emit('join-admin-room')

                    socket.on('admin-notification', async (payload) => {
                        const key = payload?.key
                        const message = payload?.message || NOTIFICATION_MESSAGES[key] || 'New admin notification'

                        const now = Date.now()
                        if (now - lastToastAtRef.current > 700) {
                            toast(message, { icon: '🔔', duration: 4500 })
                            emitBrowserNotification('The Quality Market Admin', message)
                            lastToastAtRef.current = now
                        }

                        await fetchCounts().catch(() => null)
                    })
                }
                // Whether or not Socket.IO is available, always poll on a 60 s interval
                await fetchCounts().catch(() => null)

                interval = setInterval(() => {
                    fetchCounts().catch(() => null)
                }, 60000)
            } catch (error) {
                console.error('Admin realtime notification setup failed:', error)
            }
        }

        startRealtime()

        return () => {
            active = false
            if (socket) {
                socket.emit('leave-admin-room')
                socket.off('admin-notification')
            }
            if (interval) clearInterval(interval)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => null)
        }
    }, [])

    return null
}

export default AdminNotificationWatcher
'use client'

import { useAuth } from "@clerk/nextjs"
import { useEffect, useRef } from "react"
import toast from "react-hot-toast"
import { initializeSocket } from "@/lib/socketClient"

const FALLBACK_MESSAGES = {
    productModeration: 'Your product review status was updated by admin.'
}

const StoreNotificationWatcher = () => {
    const { getToken } = useAuth()
    const lastToastAtRef = useRef(0)

    useEffect(() => {
        let socket = null
        let active = true

        const startRealtime = async () => {
            try {
                const token = await getToken()
                if (!active || !token) return

                socket = initializeSocket(token)
                socket.emit('join-store-room')

                socket.on('store-notification', (payload) => {
                    const key = payload?.key
                    const message = payload?.message || FALLBACK_MESSAGES[key] || 'New store notification'

                    const now = Date.now()
                    if (now - lastToastAtRef.current > 700) {
                        toast(message, { duration: 4500 })
                        lastToastAtRef.current = now
                    }
                })
            } catch (error) {
                console.error('Store realtime notification setup failed:', error)
            }
        }

        startRealtime()

        return () => {
            active = false
            if (socket) {
                socket.emit('leave-store-room')
                socket.off('store-notification')
            }
        }
    }, [])

    return null
}

export default StoreNotificationWatcher

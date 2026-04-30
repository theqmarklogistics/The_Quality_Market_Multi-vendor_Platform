import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  deleteCouponOnExpiry,
  expirePendingOrders,
  onChatMessageCreated,
  onPaymentProofReviewed,
  onPaymentProofSubmitted,
  onProductModerationUpdated,
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdate
} from "@/inngest/functions";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncUserCreation,
    syncUserUpdate,
    syncUserDeletion,
    deleteCouponOnExpiry,
    expirePendingOrders,
    onChatMessageCreated,
    onPaymentProofSubmitted,
    onProductModerationUpdated,
    onPaymentProofReviewed
  ],
});
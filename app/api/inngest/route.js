import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  deleteCouponOnExpiry,
  expirePendingOrders,
  kigaliPoolBatchingEngine,
  onChatMessageCreated,
  onPaymentProofReviewed,
  onPaymentProofSubmitted,
  onProductModerationUpdated,
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdate
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncUserCreation,
    syncUserUpdate,
    syncUserDeletion,
    deleteCouponOnExpiry,
    expirePendingOrders,
    kigaliPoolBatchingEngine,
    onChatMessageCreated,
    onPaymentProofSubmitted,
    onProductModerationUpdated,
    onPaymentProofReviewed
  ],
});
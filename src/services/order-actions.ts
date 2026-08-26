"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { currentMonthKey, dashboardMonthTag } from "@/src/services/dashboard";
import {
  addOrderItem,
  advanceOrderStatus,
  cancelOrder,
  confirmOrder,
  removeOrderItem,
  updateOrderItemQty,
  voidOrder,
} from "@/src/services/orders";

/**
 * Admin surfaces only — deliberately *not* the storefront's `"products"` /
 * `"bundles"` tags, which this used to blow away on every order transition.
 *
 * The line is drawn by what a mutation actually changes. These actions only
 * move stock; they never touch a name, price, image, or active flag. Dropping
 * a storefront tag for that meant a shop with a busy order desk destroyed the
 * whole public catalog cache continuously through the working day, so the
 * storefront was never warm and every visitor became a database wake — which
 * on Neon's Free plan costs a five-minute minimum each time. Mutations that
 * change what the storefront *says* still revalidate it immediately
 * (product-actions.ts, bundle-actions.ts, category-actions.ts,
 * promotion-actions.ts), as does the human-initiated `adjustStockAction`.
 *
 * What the storefront gives up is a stock number up to
 * `STOREFRONT_REVALIDATE_SECONDS` old. Nothing rides on it: `createOrderCore`
 * re-checks availability against the live row before an order is accepted, so
 * a stale "in stock" cannot oversell — it can only cost one rejected submit.
 *
 * Only the *current* month's dashboard tag is revalidated (task 16): a
 * mutation on an old order is rare and the historical months it would touch
 * stay cached until their own short revalidation window passes.
 */
async function revalidateOrder(orderId: string) {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin/orders/${orderId}`);
  revalidatePath(`/${locale}/admin`);
  revalidateTag(dashboardMonthTag(currentMonthKey()), "max");
}

export async function confirmOrderAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await confirmOrder(orderId, {
    paymentMethod: formData.get("paymentMethod") || undefined,
    paymentNote: formData.get("paymentNote") || undefined,
  });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function advanceOrderStatusAction(
  orderId: string,
  target: "preparing" | "shipped" | "ready" | "arrived" | "delivered",
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await advanceOrderStatus(orderId, {
    target,
    busCompany: formData.get("busCompany") || undefined,
    busNote: formData.get("busNote") || undefined,
  });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function cancelOrderAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await cancelOrder(orderId, { reason: formData.get("reason") });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function voidOrderAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await voidOrder(orderId, { reason: formData.get("reason") });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function addOrderItemAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const locale = await getLocale();
  const result = await addOrderItem(
    orderId,
    {
      kind: formData.get("kind"),
      productId: formData.get("productId") || undefined,
      variantId: formData.get("variantId") || undefined,
      bundleId: formData.get("bundleId") || undefined,
      qty: Number(formData.get("qty")),
    },
    locale,
  );
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function updateOrderItemQtyAction(
  orderId: string,
  itemId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await updateOrderItemQty(orderId, itemId, { qty: Number(formData.get("qty")) });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function removeOrderItemAction(
  orderId: string,
  itemId: string,
  _prev: ServiceResult<null> | null,
  _formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await removeOrderItem(orderId, itemId);
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

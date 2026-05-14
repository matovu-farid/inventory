// src/components/pos/checkout-sheet.tsx
import * as React from "react"
import { ArrowLeft, ArrowRight, Banknote, Landmark, CheckCircle2, Plus, Printer, Clock } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Button } from "#/components/ui/button"
import { useCart } from "#/components/pos/cart-context"
import { computeTotal } from "#/lib/pos/cart-reducer"
import { validateCartForCheckout } from "#/lib/pos/checkout-validate"
import { formatUgxTotal } from "#/lib/format"
import { printSaleReceipt } from "#/lib/pos/print-receipt"
import { cn } from "#/lib/utils"
import { submitSaleOfflineAware } from "#/lib/offline/offline-record-sale"

type Stage = "payment" | "confirm" | "success"
type SaleMode = "online" | "queued"

type Props = {
  shopId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaleComplete: () => void
}

export function CheckoutSheet({ shopId, open, onOpenChange, onSaleComplete }: Props) {
  const { state, clear } = useCart()
  const [stage, setStage] = React.useState<Stage>("payment")
  const [paymentMethod, setPaymentMethod] = React.useState<"cash" | "bank">("cash")
  const [submitting, setSubmitting] = React.useState(false)
  const [completedSaleId, setCompletedSaleId] = React.useState<string | null>(null)
  const [saleMode, setSaleMode] = React.useState<SaleMode>("online")
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setStage("payment")
      setErrorMsg(null)
      setCompletedSaleId(null)
    }
  }, [open])

  const total = computeTotal(state.items)

  async function handleConfirm() {
    const validation = validateCartForCheckout(state.items)
    if (!validation.ok) {
      setErrorMsg("Some items are invalid. Re-check qty, price, or reason.")
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const input = {
        shopId,
        paymentMethod,
        items: state.items.map((i) => ({
          shopStockId: i.shopStockId,
          quantity: i.qty,
          unitPriceUgx: i.unitPriceUgx,
          belowMinimumReason: i.belowMinimumReason.trim() || undefined,
        })),
      }
      const result = await submitSaleOfflineAware(input)
      if (result.ok) {
        setSaleMode(result.mode)
        setCompletedSaleId(result.mode === "online" ? result.saleId : result.localId)
        setStage("success")
      } else {
        // Business/validation error — surface message, stay on confirm
        setErrorMsg(result.reason)
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to record sale")
    } finally {
      setSubmitting(false)
    }
  }

  function handleNewSale() {
    clear()
    onSaleComplete()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {stage === "payment" && "Payment"}
            {stage === "confirm" && "Confirm sale"}
            {stage === "success" && "Sale recorded"}
          </SheetTitle>
          {stage !== "success" && (
            <p className="text-xs text-muted-foreground">Step {stage === "payment" ? 1 : 2} of 2</p>
          )}
        </SheetHeader>

        {stage === "payment" && (
          <div className="space-y-3 px-4">
            <p className="text-sm text-muted-foreground">
              {state.items.length} {state.items.length === 1 ? "item" : "items"} · {formatUgxTotal(total)} total
            </p>
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left",
                paymentMethod === "cash" ? "border-green-600 bg-green-50" : "border-border bg-background",
              )}
            >
              <div className="grid size-12 place-items-center rounded-lg bg-muted">
                <Banknote className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Cash</p>
                <p className="text-xs text-muted-foreground">Money received now</p>
              </div>
              {paymentMethod === "cash" && <CheckCircle2 className="size-5 text-green-600" />}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("bank")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left",
                paymentMethod === "bank" ? "border-green-600 bg-green-50" : "border-border bg-background",
              )}
            >
              <div className="grid size-12 place-items-center rounded-lg bg-muted">
                <Landmark className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Bank</p>
                <p className="text-xs text-muted-foreground">Mobile money, card, transfer</p>
              </div>
              {paymentMethod === "bank" && <CheckCircle2 className="size-5 text-green-600" />}
            </button>
          </div>
        )}

        {stage === "confirm" && (
          <div className="space-y-3 px-4">
            {state.items.map((i) => (
              <div key={i.shopStockId} className="flex justify-between border-b py-2 text-sm">
                <span className="truncate pr-3">
                  {i.qty}× {i.productLabel}
                </span>
                <span className="font-mono">{formatUgxTotal(Number(i.unitPriceUgx) * i.qty)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 text-sm">
              <span className="text-muted-foreground">Payment</span>
              <span className="font-semibold capitalize">{paymentMethod}</span>
            </div>
            <div className="flex justify-between border-t-2 pt-2">
              <span className="font-bold">Total</span>
              <span className="font-mono text-xl font-bold">{formatUgxTotal(total)}</span>
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </div>
        )}

        {stage === "success" && (
          <div className="space-y-4 px-4 py-6 text-center">
            <div
              className={cn(
                "mx-auto grid size-16 place-items-center rounded-full text-white",
                saleMode === "queued" ? "bg-blue-500" : "bg-green-600",
              )}
            >
              {saleMode === "queued" ? (
                <Clock className="size-9" />
              ) : (
                <CheckCircle2 className="size-9" />
              )}
            </div>
            <div>
              <p className="text-lg font-bold">
                {saleMode === "queued" ? "Sale queued (offline)" : "Sale recorded"}
              </p>
              {saleMode === "queued" ? (
                <p className="text-xs text-muted-foreground">
                  Will sync automatically when connectivity returns
                </p>
              ) : (
                <p className="font-mono text-xs text-muted-foreground">
                  #{completedSaleId?.slice(0, 8) ?? "—"}
                </p>
              )}
            </div>
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="font-semibold">{state.items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-semibold capitalize">{paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono font-semibold">{formatUgxTotal(total)}</span>
              </div>
            </div>
            <div className="space-y-2">
              {saleMode === "online" ? (
                <Button
                  variant="outline"
                  className="h-12 w-full"
                  disabled={!completedSaleId}
                  onClick={() => {
                    if (!completedSaleId) return
                    void (async () => {
                      try {
                        await printSaleReceipt(completedSaleId)
                      } catch (e) {
                        setErrorMsg(e instanceof Error ? e.message : "Could not open receipt")
                      }
                    })()
                  }}
                >
                  <Printer className="mr-2 size-4" /> Print receipt
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <Clock className="size-3.5 shrink-0" />
                  Print receipt available after sync
                </div>
              )}
              <Button className="h-12 w-full" onClick={handleNewSale}>
                <Plus className="mr-2 size-4" /> New sale
              </Button>
              {errorMsg && (
                <p className="text-center text-sm text-destructive">{errorMsg}</p>
              )}
            </div>
          </div>
        )}

        {stage !== "success" && (
          <div className="sticky bottom-0 mt-4 flex gap-2 border-t bg-background px-4 py-3">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                if (stage === "payment") onOpenChange(false)
                else setStage("payment")
              }}
            >
              <ArrowLeft className="mr-1 size-4" /> Back
            </Button>
            {stage === "payment" && (
              <Button className="h-11 flex-1" onClick={() => setStage("confirm")}>
                Next <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
            {stage === "confirm" && (
              <Button
                className="h-11 flex-1 bg-green-600 text-white hover:bg-green-700"
                onClick={() => void handleConfirm()}
                disabled={submitting}
              >
                {submitting ? "Recording..." : "Confirm sale ✓"}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

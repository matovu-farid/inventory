import { createFileRoute, Link } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import {
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Users,
} from "lucide-react"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Inventory & Trade Management System
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link to="/supply">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Truck className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Supply Routes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage buying trips, track procurement costs, and record
                expenses.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/supply/suppliers">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Suppliers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage local and international suppliers.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/store">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Store Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View warehouse inventory, set prices, and manage stock levels.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/store/transfers">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Truck className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Transfer goods from warehouse to retail shops.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/shop">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Shop & Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View shop inventory and record retail sales.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/reports">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                P&L, balance sheet, cash position, and general ledger.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}

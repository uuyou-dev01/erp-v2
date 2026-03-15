import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const metrics = [
    {
      title: "Total Revenue",
      value: "$1,250.00",
      change: "+12.5%",
      trend: "up",
      subtitle: "Trending up this month",
      description: "Visitors for the last 6 months",
    },
    {
      title: "New Customers",
      value: "1,234",
      change: "-20%",
      trend: "down",
      subtitle: "Down 20% this period",
      description: "Acquisition needs attention",
    },
    {
      title: "Active Accounts",
      value: "45,678",
      change: "+18.5%",
      trend: "up",
      subtitle: "Strong user retention",
      description: "Engagement exceed targets",
    },
    {
      title: "Growth Rate",
      value: "4.5%",
      change: "+4.5%",
      trend: "up",
      subtitle: "Steady performance",
      description: "Meets growth projections",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back to your ERP system</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              {metric.trend === "up" ? (
                <ArrowUpRight className="h-4 w-4 text-green-500" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={
                    metric.trend === "up" ? "text-green-500" : "text-red-500"
                  }
                >
                  {metric.change}
                </span>
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {metric.subtitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {metric.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total Visitors</CardTitle>
          <p className="text-sm text-muted-foreground">
            Total for the last 3 months
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            Chart placeholder - Will integrate chart library later
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="font-medium">New purchase order created</p>
                <p className="text-sm text-muted-foreground">PO-2024-001</p>
              </div>
              <span className="text-sm text-muted-foreground">2 hours ago</span>
            </div>
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="font-medium">Inventory received</p>
                <p className="text-sm text-muted-foreground">50 units of SKU-123</p>
              </div>
              <span className="text-sm text-muted-foreground">5 hours ago</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Order confirmed</p>
                <p className="text-sm text-muted-foreground">Order #ORD-2024-042</p>
              </div>
              <span className="text-sm text-muted-foreground">1 day ago</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

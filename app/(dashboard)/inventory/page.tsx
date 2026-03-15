import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Box, Package, PackageOpen } from "lucide-react";
import Link from "next/link";

export default function InventoryPage() {
  const modules = [
    {
      title: "Locations",
      description: "Manage warehouses, forwarders, and storage locations",
      icon: MapPin,
      href: "/inventory/locations",
      color: "text-blue-500",
    },
    {
      title: "SKUs",
      description: "Product definitions and catalog management",
      icon: Box,
      href: "/inventory/skus",
      color: "text-green-500",
    },
    {
      title: "Inventory Lots",
      description: "New goods batches and quantity tracking",
      icon: Package,
      href: "/inventory/lots",
      color: "text-purple-500",
    },
    {
      title: "Item Units",
      description: "Individual used/defective items tracking",
      icon: PackageOpen,
      href: "/inventory/items",
      color: "text-orange-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground">
          Manage your inventory, locations, and stock levels
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Card key={module.title} className="hover:border-primary transition-colors">
            <CardHeader>
              <div className="flex items-center gap-3">
                <module.icon className={`h-8 w-8 ${module.color}`} />
                <CardTitle>{module.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">{module.description}</p>
              <Link href={module.href}>
                <Button variant="outline" className="w-full">
                  Manage {module.title}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Locations</p>
              <p className="text-2xl font-bold">0</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Active SKUs</p>
              <p className="text-2xl font-bold">0</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Units</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

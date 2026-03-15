"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSKU, updateSKU } from "@/app/actions/skus";
import { X, Plus, Upload, Link as LinkIcon } from "lucide-react";

interface SKUFormProps {
  storeId: string;
  initialData?: {
    id: string;
    code: string;
    name: string;
    category?: string | null;
    brand?: string | null;
    attributes?: Record<string, unknown> | null;
    description?: string | null;
    imageUrl?: string | null;
  };
}

export function SKUForm({ storeId, initialData }: SKUFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"url" | "file">("url");
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    code: initialData?.code || "",
    name: initialData?.name || "",
    category: initialData?.category || "",
    brand: initialData?.brand || "",
    description: initialData?.description || "",
    imageUrl: initialData?.imageUrl || "",
  });

  // Parse attributes from JSON to key-value pairs
  const [attributes, setAttributes] = useState<Array<{ key: string; value: string }>>(
    initialData?.attributes
      ? Object.entries(initialData.attributes).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      : []
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.");
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("File too large. Maximum size is 5MB.");
      return;
    }

    setUploading(true);

    try {
      // Upload file to server
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const { url } = await response.json();
      setFormData({ ...formData, imageUrl: url });
    } catch (error) {
      console.error("Upload error:", error);
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convert attributes array to object
      const attributesObj = attributes.reduce(
        (acc, attr) => {
          if (attr.key.trim()) {
            acc[attr.key.trim()] = attr.value;
          }
          return acc;
        },
        {} as Record<string, string>
      );

      const data = {
        storeId,
        code: formData.code,
        name: formData.name,
        category: formData.category || undefined,
        brand: formData.brand || undefined,
        attributes: Object.keys(attributesObj).length > 0 ? attributesObj : undefined,
        description: formData.description || undefined,
        imageUrl: formData.imageUrl || undefined,
      };

      if (initialData) {
        await updateSKU({
          id: initialData.id,
          ...data,
        });
      } else {
        await createSKU(data);
      }

      router.push("/inventory/skus");
      router.refresh();
    } catch (error) {
      console.error("Failed to save SKU:", error);
      alert("Failed to save SKU. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const addAttribute = () => {
    setAttributes([...attributes, { key: "", value: "" }]);
  };

  const removeAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (index: number, field: "key" | "value", value: string) => {
    const newAttributes = [...attributes];
    newAttributes[index][field] = value;
    setAttributes(newAttributes);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="code">SKU Code *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., SHOE-001, BOX-BLIND-A"
                required
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for this product
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Nike Air Max 90"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Shoes, Blind Box, Electronics"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="e.g., Nike, Sony, Pop Mart"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Product description, notes, or specifications"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Product Image</Label>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                variant={uploadMode === "url" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMode("url")}
              >
                <LinkIcon className="mr-2 h-4 w-4" />
                URL
              </Button>
              <Button
                type="button"
                variant={uploadMode === "file" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMode("file")}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </div>

            {uploadMode === "url" ? (
              <>
                <Input
                  id="imageUrl"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                />
                <p className="text-xs text-muted-foreground">
                  Enter an image URL from the web
                </p>
              </>
            ) : (
              <>
                <Input
                  id="imageFile"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground">
                  {uploading
                    ? "Uploading..."
                    : "Upload an image from your computer (max 5MB, JPEG/PNG/GIF/WebP)"}
                </p>
              </>
            )}

            {formData.imageUrl && (
              <div className="mt-2 border rounded-lg p-2 bg-muted/50 relative">
                <img
                  src={formData.imageUrl}
                  alt="Preview"
                  className="max-h-32 rounded object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => setFormData({ ...formData, imageUrl: "" })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Attributes</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
              <Plus className="mr-2 h-4 w-4" />
              Add Attribute
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No attributes yet. Add custom attributes like size, color, model, etc.
            </p>
          ) : (
            <div className="space-y-3">
              {attributes.map((attr, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Key (e.g., size, color)"
                    value={attr.key}
                    onChange={(e) => updateAttribute(index, "key", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value (e.g., 42, red)"
                    value={attr.value}
                    onChange={(e) => updateAttribute(index, "value", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAttribute(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Add custom attributes to describe product variations or specifications
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading || uploading}>
          {loading ? "Saving..." : initialData ? "Update SKU" : "Create SKU"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading || uploading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

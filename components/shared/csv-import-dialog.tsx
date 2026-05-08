"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, X, CheckCircle, AlertCircle, FileText } from "lucide-react";
import Papa from "papaparse";

interface ColumnMapping {
  csvColumn: string;
  targetField: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

interface CSVImportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  targetFields: Array<{ key: string; label: string; required?: boolean }>;
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>;
}

export function CSVImportDialog({ open, onClose, title, targetFields, onImport }: CSVImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "mapping" | "result">("upload");
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 2) {
          alert("CSV文件至少需要包含标题行和一行数据");
          return;
        }
        const headers = data[0].map((h) => h.trim());
        setCsvHeaders(headers);
        setCsvData(data.slice(1).filter((row) => row.some((cell) => cell.trim())));

        const autoMappings = targetFields.map((field) => {
          const match = headers.find(
            (h) => h.toLowerCase() === field.key.toLowerCase() || h.toLowerCase() === field.label.toLowerCase()
          );
          return { csvColumn: match || "", targetField: field.key };
        });
        setMappings(autoMappings);
        setStep("preview");
      },
      error: () => {
        alert("CSV解析失败，请检查文件格式");
      },
    });
  };

  const handleMapping = (targetField: string, csvColumn: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.targetField === targetField ? { ...m, csvColumn } : m))
    );
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const rows = csvData.map((row) => {
        const mapped: Record<string, string> = {};
        mappings.forEach((m) => {
          if (m.csvColumn) {
            const colIndex = csvHeaders.indexOf(m.csvColumn);
            if (colIndex >= 0 && row[colIndex]) {
              mapped[m.targetField] = row[colIndex].trim();
            }
          }
        });
        return mapped;
      });

      const importResult = await onImport(rows);
      setResult(importResult);
      setStep("result");
    } catch {
      alert("导入失败，请重试");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setCsvData([]);
    setCsvHeaders([]);
    setMappings([]);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <Card className="relative w-full max-w-2xl max-h-[80vh] overflow-auto z-10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{title}</CardTitle>
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {step === "upload" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Upload className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">选择CSV文件进行导入</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button onClick={() => fileRef.current?.click()}>
                <FileText className="mr-2 h-4 w-4" />
                选择文件
              </Button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                已读取 {csvData.length} 行数据，以下是前5行预览：
              </p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted">
                      {csvHeaders.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 truncate max-w-[200px]">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={() => setStep("mapping")}>下一步：列映射</Button>
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">请将CSV列映射到对应字段：</p>
              <div className="space-y-3">
                {targetFields.map((field) => {
                  const mapping = mappings.find((m) => m.targetField === field.key);
                  return (
                    <div key={field.key} className="flex items-center gap-3">
                      <span className="text-sm w-32 shrink-0">
                        {field.label}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </span>
                      <select
                        value={mapping?.csvColumn || ""}
                        onChange={(e) => handleMapping(field.key, e.target.value)}
                        className="flex-1 rounded-md border px-3 py-2 text-sm bg-background"
                      >
                        <option value="">（不映射）</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setStep("preview")} variant="outline">上一步</Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? "导入中..." : `确认导入 (${csvData.length} 行)`}
                </Button>
              </div>
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                {result.failed === 0 ? (
                  <CheckCircle className="h-8 w-8 text-green-500" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium">导入完成</p>
                  <p className="text-sm text-muted-foreground">
                    成功 {result.success} 行，失败 {result.failed} 行
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-auto border rounded-lg p-3 space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">
                      第{err.row}行：{err.message}
                    </p>
                  ))}
                </div>
              )}
              <Button onClick={handleClose}>关闭</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

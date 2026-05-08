"use client";

import { Button } from "@/components/ui/button";
import { Bell, User, Menu } from "lucide-react";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-white/20 glass px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/20">
          <Bell className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/20">
          <User className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

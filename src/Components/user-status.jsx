"use client"

import { LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"

export function UserStatus({ userName = "User", onLogout }) {
  return (
    <div className="fixed bottom-6 left-6 z-50">
      <div className="glass-card rounded-full px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">
            {userName} logged in
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
        >
          <LogOut className="w-4 h-4 mr-1" />
          Logout
        </Button>
      </div>
    </div>
  )
}

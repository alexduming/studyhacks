"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Crown } from "lucide-react";

import { cn } from "@/shared/lib/utils";

function Avatar({
  className,
  isVip,
  vipLevel,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  isVip?: boolean;
  vipLevel?: 'plus' | 'pro';
}) {
  return (
    <div className="relative inline-block">
      <AvatarPrimitive.Root
        data-slot="avatar"
        className={cn(
          "relative flex size-8 shrink-0 overflow-hidden rounded-full",
          className
        )}
        {...props}
      />
      {isVip && (
        <div 
          className={cn(
            "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white shadow-sm",
            vipLevel === 'pro' ? "bg-purple-500" : "bg-blue-500"
          )}
          title={vipLevel?.toUpperCase() + " Member"}
        >
          <Crown className="size-2.5 text-white" fill="currentColor" />
        </div>
      )}
    </div>
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };

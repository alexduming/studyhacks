import {
  Card as CardComponent,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@/shared/components/ui/card";

import { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Button as ButtonType } from "@/shared/types/blocks/common";
import { Button } from "@/shared/components/ui/button";
import { Link } from "@/core/i18n/navigation";
import { SmartIcon } from "../common/smart-icon";
import { Badge } from "@/shared/components/ui/badge";

export function PanelCard({
  title,
  label,
  description,
  content,
  buttons,
  children,
  className,
}: {
  title?: string;
  label?: string;
  description?: string;
  content?: string;
  buttons?: ButtonType[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <CardComponent className={cn("pb-0 overflow-hidden", className)}>
      {(title || description) && (
        <CardHeader>
          <CardTitle>
            {title}
            {label && (
              <Badge
                variant="outline"
                className="rounded-md px-2 py-1 text-xs float-right"
              >
                {label}
              </Badge>
            )}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      {(content || children) && (
        <CardContent className="text-muted-foreground">
          {content || children}
        </CardContent>
      )}
      {buttons && buttons.length > 0 && (
        <CardFooter className="bg-muted py-4 flex justify-start gap-4">
          {buttons.map((button, idx) => (
            <Button
              key={idx}
              variant={button.variant || "default"}
              size={button.size || "default"}
              asChild
            >
              <Link href={button.url || ""} target={button.target || "_self"}>
                {button.icon && <SmartIcon name={button.icon as string} />}
                {button.title}
              </Link>
            </Button>
          ))}
        </CardFooter>
      )}
    </CardComponent>
  );
}

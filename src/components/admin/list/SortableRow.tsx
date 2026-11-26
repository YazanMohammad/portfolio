import { useState } from "react";
import { ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

type Props = {
  id: number;
  title: string;
  thumbnail?: string | null;
  featured?: boolean;
  subtitle: string | null;
  isVisible: boolean;
  toFillIn: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onToggleVisible: (visible: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function SortableRow(p: Props) {
  const [failedImage,setFailedImage]=useState<string|null>(null);
  return (
    <li
      className="admin-list-row group relative flex min-h-11 items-center gap-2 border-b border-border bg-background px-2"
    >
      <div className="admin-reorder"><button type="button" aria-label={`Move ${p.title} up`} disabled={p.isFirst} onClick={p.onMoveUp}><ArrowUp size={14} aria-hidden="true"/></button><button type="button" aria-label={`Move ${p.title} down`} disabled={p.isLast} onClick={p.onMoveDown}><ArrowDown size={14} aria-hidden="true"/></button></div>
      {p.thumbnail&&failedImage!==p.thumbnail&&<img className="admin-list-thumb" src={p.thumbnail} alt="" onError={()=>setFailedImage(p.thumbnail??null)}/>}
      <button
        type="button"
        onClick={p.onOpen}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-sm py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-sm font-medium text-foreground">{p.title}</span>
        {p.subtitle && <span className="truncate text-xs text-muted-foreground">{p.subtitle}</span>}
      </button>

      {p.featured && <Badge variant="outline">Featured</Badge>}
      {p.toFillIn && <Badge variant="outline">To fill in</Badge>}

      <div className="admin-visibility"><span>{p.isVisible?"Visible":"Hidden"}</span><Switch
        checked={p.isVisible}
        onCheckedChange={p.onToggleVisible}
        aria-label={`Show ${p.title} on the site`}
      /></div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${p.title}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={p.onOpen}>Edit</DropdownMenuItem>
          <DropdownMenuItem disabled={p.isFirst} onSelect={p.onMoveUp}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={p.isLast} onSelect={p.onMoveDown}>
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={p.onDuplicate}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={p.onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

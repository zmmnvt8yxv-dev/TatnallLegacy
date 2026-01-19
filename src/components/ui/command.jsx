import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Search } from "lucide-react"
import { cn } from "../lib/utils"

const Command = React.forwardRef(({ className, ...props }, ref) => (
    <CommandPrimitive
        ref={ref}
        className={cn(
            "flex h-full w-full flex-col overflow-hidden rounded-md bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50",
            className
        )}
        {...props}
    />
))
Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({ children, ...props }) => {
    return (
        <CommandPrimitive.Dialog
            transition
            className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] sm:pt-[25vh]"
            {...props}
        >
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-all" />
            <div className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-950">
                {children}
            </div>
        </CommandPrimitive.Dialog>
    )
}

const CommandInput = React.forwardRef(({ className, ...props }, ref) => (
    <div className="flex items-center border-b border-zinc-200 px-3 dark:border-zinc-800" cmdk-input-wrapper="">
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <CommandPrimitive.Input
            ref={ref}
            className={cn(
                "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-zinc-400",
                className
            )}
            {...props}
        />
    </div>
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef(({ className, ...props }, ref) => (
    <CommandPrimitive.List
        ref={ref}
        className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
        {...props}
    />
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef((props, ref) => (
    <CommandPrimitive.Empty
        ref={ref}
        className="py-6 text-center text-sm"
        {...props}
    />
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef(({ className, ...props }, ref) => (
    <CommandPrimitive.Group
        ref={ref}
        className={cn(
            "overflow-hidden p-1 text-zinc-950 dark:text-zinc-50 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-500 dark:[&_[cmdk-group-heading]]:text-zinc-400",
            className
        )}
        {...props}
    />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef(({ className, ...props }, ref) => (
    <CommandPrimitive.Separator
        ref={ref}
        className={cn("-mx-1 h-px bg-zinc-200 dark:bg-zinc-800", className)}
        {...props}
    />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = React.forwardRef(({ className, ...props }, ref) => (
    <CommandPrimitive.Item
        ref={ref}
        className={cn(
            "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
            className
        )}
        {...props}
    />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({ className, ...props }) => {
    return (
        <span
            className={cn(
                "ml-auto text-xs tracking-widest text-zinc-500 dark:text-zinc-400",
                className
            )}
            {...props}
        />
    )
}
CommandShortcut.displayName = "CommandShortcut"

export {
    Command,
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandShortcut,
    CommandSeparator,
}

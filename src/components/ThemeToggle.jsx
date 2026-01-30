import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';
import { motion } from 'framer-motion';

/**
 * ThemeToggle - Animated button to switch between light and dark themes
 */
export default function ThemeToggle() {
    const { isDark, toggleTheme } = useTheme();

    return (
        <motion.button
            onClick={toggleTheme}
            className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
        >
            <motion.div
                initial={false}
                animate={{
                    rotate: isDark ? 0 : 180,
                    scale: isDark ? 1 : 1
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="text-[var(--text-primary)]"
            >
                {isDark ? (
                    <Moon size={18} className="text-[var(--accent)]" />
                ) : (
                    <Sun size={18} className="text-amber-500" />
                )}
            </motion.div>
        </motion.button>
    );
}

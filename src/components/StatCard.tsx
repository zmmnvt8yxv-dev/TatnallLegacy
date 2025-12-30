import type { ReactNode } from "react";
import { motion } from "framer-motion";

type StatCardProps = {
  label: string;
  value: ReactNode;
  caption?: string;
};

export function StatCard({ label, value, caption }: StatCardProps) {
  return (
    <motion.div
      className="stat"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4 }}
    >
      <h3>{label}</h3>
      <p>{value}</p>
      {caption ? <span className="text-xs text-muted">{caption}</span> : null}
    </motion.div>
  );
}

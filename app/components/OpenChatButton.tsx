"use client";

import React from "react";

interface OpenChatButtonProps {
  className?: string;
  children: React.ReactNode;
  id?: string;
}

export default function OpenChatButton({
  className = "btn-primary",
  children,
  id,
}: OpenChatButtonProps) {
  const handleClick = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-chat"));
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      id={id}
    >
      {children}
    </button>
  );
}

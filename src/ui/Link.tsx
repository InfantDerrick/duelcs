import terminalLink from "terminal-link";
import React from "react";
import { Text } from "ink";

interface LinkProps {
  url: string;
  children: string;
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
  underline?: boolean;
}

/**
 * Clickable terminal hyperlink (OSC 8). Falls back to plain text on terminals
 * that do not support hyperlinks.
 */
export function Link({ url, children, color, bold, dimColor, underline }: LinkProps) {
  const rendered = terminalLink(children, url, {
    fallback: (text) => text,
  });

  return (
    <Text color={color} bold={bold} dimColor={dimColor} underline={underline}>
      {rendered}
    </Text>
  );
}

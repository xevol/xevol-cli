import { Box } from "ink";
import React from "react";

interface ModalProps {
  children: React.ReactNode;
}

/**
 * Full-screen modal overlay with opaque dark background.
 *
 * Uses position="absolute" to overlay on top of sibling content.
 * The backgroundColor fills the entire area with dark spaces via Ink's
 * renderBackground, making it visually opaque over the content beneath.
 *
 * Must be rendered inside a parent Box with explicit or flex-derived dimensions.
 */
export function Modal({ children }: ModalProps): JSX.Element {
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      {children}
    </Box>
  );
}

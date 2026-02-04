import { Box } from "ink";
import React from "react";

interface ModalProps {
  children: React.ReactNode;
}

/**
 * Full-screen modal overlay.
 * Children should manage their own input locking via useInputLock.
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

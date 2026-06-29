import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      closeButton
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#111827",
          "--normal-border": "#cbd5e1",
          "--error-bg": "#ffffff",
          "--error-text": "#7f1d1d",
          "--error-border": "#fca5a5",
          "--success-bg": "#ffffff",
          "--success-text": "#14532d",
          "--success-border": "#86efac",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };

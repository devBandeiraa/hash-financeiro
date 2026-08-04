import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tema = "dark" | "light";

const CHAVE = "hash-financeiro-tema";

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  raiz.classList.toggle("dark", tema === "dark");
  raiz.style.colorScheme = tema;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>("dark");

  useEffect(() => {
    const salvo = localStorage.getItem(CHAVE) as Tema | null;
    const inicial: Tema = salvo === "light" || salvo === "dark" ? salvo : "dark";
    setTema(inicial);
    aplicar(inicial);
  }, []);

  function alternar() {
    const proximo: Tema = tema === "dark" ? "light" : "dark";
    setTema(proximo);
    aplicar(proximo);
    localStorage.setItem(CHAVE, proximo);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={alternar}
      aria-label={tema === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      title={tema === "dark" ? "Modo claro" : "Modo escuro"}
      className={cn("relative", className)}
    >
      <Sun
        className={cn(
          "h-4 w-4 transition-all",
          tema === "dark" ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-all",
          tema === "dark" ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0",
        )}
      />
    </Button>
  );
}

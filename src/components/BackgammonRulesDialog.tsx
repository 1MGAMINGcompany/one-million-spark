import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, BookOpen, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackgammonRulesDialogProps {
  className?: string;
  variant?: "icon" | "button";
}

export const BackgammonRulesDialog = ({ 
  className,
  variant = "icon" 
}: BackgammonRulesDialogProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full border border-primary/30 bg-background/80 backdrop-blur hover:bg-primary/10 hover:border-primary/50 transition-all",
              className
            )}
          >
            <Info className="h-4 w-4 text-primary" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "border-primary/30 text-primary hover:bg-primary/10",
              className
            )}
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Rules
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-background/95 backdrop-blur border-primary/30 p-0 max-h-[85vh]" aria-describedby={undefined}>
        <DialogHeader className="p-6 pb-0">
          <DialogTitle
            className="text-xl font-display flex items-center gap-2"
            style={{
              background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            <Gamepad2 className="h-5 w-5 text-primary" />
            Backgammon
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="rules" className="w-full">
          <TabsList className="w-full justify-start px-6 bg-transparent border-b border-primary/20 rounded-none h-auto pb-0">
            <TabsTrigger 
              value="rules" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3 text-sm"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Rules
            </TabsTrigger>
            <TabsTrigger 
              value="gameplay" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3 text-sm"
            >
              <Gamepad2 className="h-4 w-4 mr-2" />
              Gameplay
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="h-[400px]">
            <TabsContent value="rules" className="p-6 pt-4 m-0">
              <div className="space-y-4 text-sm">
                <h3 className="font-display font-semibold text-primary text-base">Backgammon Rules</h3>
                
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    Each player starts with 15 checkers.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    Players move checkers according to dice rolls.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    Checkers move in one direction only.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    A checker landing alone on a point can be hit and sent to the bar.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    Players must re-enter checkers from the bar before making other moves.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    Once all checkers are in the home board, players may bear off.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    First player to bear off all checkers wins.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    No disputes. The game logic decides the winner.
                  </li>
                </ul>

                <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <h4 className="font-display font-semibold text-primary text-sm mb-2">Bearing Off</h4>
                  <ul className="space-y-2 text-muted-foreground text-xs">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      You can only bear off when ALL your checkers are in your home board.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      If a die exactly matches a checker's position, that checker may be borne off.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      If no checker is on the exact point, you may bear off from the highest occupied point lower than the die.
                    </li>
                  </ul>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="gameplay" className="p-6 pt-4 m-0">
              <div className="space-y-4 text-sm">
                <h3 className="font-display font-semibold text-primary text-base">Gameplay Flow</h3>
                
                <ol className="space-y-4 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">
                      1
                    </span>
                    <span>Both players accept the rules before the game starts.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">
                      2
                    </span>
                    <span>Dice are rolled automatically.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">
                      3
                    </span>
                    <span>Moves must follow official backgammon rules.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">
                      4
                    </span>
                    <span>Illegal moves are blocked by the system.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">
                      5
                    </span>
                    <span>When all checkers are borne off, the game ends instantly.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">
                      6
                    </span>
                    <span>Winnings are paid automatically.</span>
                  </li>
                </ol>

                <div className="mt-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                  <h4 className="font-display font-semibold text-green-400 text-sm mb-2">Skill-Based Gaming</h4>
                  <p className="text-xs text-muted-foreground">
                    This is a skill-based game. Winners are determined by strategy and gameplay decisions. 
                    All results are final and processed automatically by the game logic.
                  </p>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default BackgammonRulesDialog;

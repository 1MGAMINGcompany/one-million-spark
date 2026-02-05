 import { useState, useEffect, useCallback } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import { Button } from "@/components/ui/button";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@/components/ui/table";
 import { RefreshCw, AlertTriangle, X } from "lucide-react";
 import { cn } from "@/lib/utils";
 
 interface GameMove {
   turn_number: number;
   wallet: string;
   move_data: {
     type: string;
     nextTurnWallet?: string;
     timedOutWallet?: string;
     winnerWallet?: string;
     missedCount?: number;
     [key: string]: any;
   };
   created_at: string;
   move_hash: string;
 }
 
 interface GameMoveAuditProps {
   roomPda: string;
   onClose?: () => void;
 }
 
 export function GameMoveAudit({ roomPda, onClose }: GameMoveAuditProps) {
   const [moves, setMoves] = useState<GameMove[]>([]);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
 
   const fetchMoves = useCallback(async () => {
     if (!roomPda) return;
     
     setLoading(true);
     setError(null);
     
     try {
       const { data, error: fetchError } = await supabase.functions.invoke("get-moves", {
         body: { roomPda },
       });
       
       if (fetchError) {
         setError(fetchError.message);
         return;
       }
       
       setMoves(data?.moves || []);
     } catch (err) {
       setError(err instanceof Error ? err.message : "Failed to fetch moves");
     } finally {
       setLoading(false);
     }
   }, [roomPda]);
 
   useEffect(() => {
     fetchMoves();
   }, [fetchMoves]);
 
   // Detect anomalies - move after turn_end by same player
   const detectAnomalies = (moves: GameMove[]): Set<number> => {
     const anomalyIndices = new Set<number>();
     
     for (let i = 1; i < moves.length; i++) {
       const prev = moves[i - 1];
       const curr = moves[i];
       
       // If previous was turn_end and current is from same wallet with move/dice_roll type
       if (
         prev.move_data?.type === "turn_end" &&
         curr.wallet === prev.wallet &&
         (curr.move_data?.type === "move" || curr.move_data?.type === "dice_roll")
       ) {
         anomalyIndices.add(i);
       }
     }
     
     return anomalyIndices;
   };
 
   const anomalies = detectAnomalies(moves);
 
   const formatWallet = (wallet: string) => {
     if (!wallet) return "—";
     return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
   };
 
   const formatTime = (isoString: string) => {
     const date = new Date(isoString);
     return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
   };
 
   const getTypeColor = (type: string) => {
     switch (type) {
       case "dice_roll":
         return "text-blue-400";
       case "move":
         return "text-green-400";
       case "turn_end":
         return "text-yellow-400";
       case "turn_timeout":
         return "text-orange-400";
       case "auto_forfeit":
         return "text-red-400";
       case "resign":
       case "forfeit":
         return "text-red-500";
       default:
         return "text-muted-foreground";
     }
   };
 
   return (
     <div className="fixed inset-0 z-[2147483646] bg-black/80 flex items-center justify-center p-4">
       <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
         {/* Header */}
         <div className="flex items-center justify-between p-4 border-b border-border">
           <div>
             <h2 className="text-lg font-semibold">Game Move Audit</h2>
             <p className="text-xs text-muted-foreground">
               Room: {formatWallet(roomPda)} • {moves.length} moves
             </p>
           </div>
           <div className="flex gap-2">
             <Button
               variant="outline"
               size="sm"
               onClick={fetchMoves}
               disabled={loading}
             >
               <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
             </Button>
             {onClose && (
               <Button variant="ghost" size="sm" onClick={onClose}>
                 <X className="h-4 w-4" />
               </Button>
             )}
           </div>
         </div>
 
         {/* Anomaly warning */}
         {anomalies.size > 0 && (
           <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
             <AlertTriangle className="h-4 w-4 text-destructive" />
             <span className="text-sm text-destructive">
               {anomalies.size} anomal{anomalies.size === 1 ? "y" : "ies"} detected (move after turn_end by same player)
             </span>
           </div>
         )}
 
         {/* Error */}
         {error && (
           <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
             Error: {error}
           </div>
         )}
 
         {/* Moves table */}
         <ScrollArea className="flex-1">
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead className="w-12">#</TableHead>
                 <TableHead className="w-24">Time</TableHead>
                 <TableHead className="w-24">Wallet</TableHead>
                 <TableHead className="w-28">Type</TableHead>
                 <TableHead>Details</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {moves.length === 0 && !loading && (
                 <TableRow>
                   <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                     No moves recorded
                   </TableCell>
                 </TableRow>
               )}
               {moves.map((move, index) => {
                 const isAnomaly = anomalies.has(index);
                 const type = move.move_data?.type || "unknown";
                 
                 // Build details string
                 const details: string[] = [];
                 if (move.move_data?.nextTurnWallet) {
                   details.push(`→ ${formatWallet(move.move_data.nextTurnWallet)}`);
                 }
                 if (move.move_data?.timedOutWallet) {
                   details.push(`timeout: ${formatWallet(move.move_data.timedOutWallet)}`);
                 }
                 if (move.move_data?.missedCount !== undefined) {
                   details.push(`missed: ${move.move_data.missedCount}`);
                 }
                 if (move.move_data?.winnerWallet) {
                   details.push(`winner: ${formatWallet(move.move_data.winnerWallet)}`);
                 }
                 if (move.move_data?.dice) {
                   details.push(`dice: [${move.move_data.dice.join(", ")}]`);
                 }
 
                 return (
                   <TableRow
                     key={`${move.turn_number}-${move.move_hash}`}
                     className={cn(isAnomaly && "bg-destructive/10")}
                   >
                     <TableCell className="font-mono text-xs">
                       {isAnomaly && <AlertTriangle className="h-3 w-3 text-destructive inline mr-1" />}
                       {move.turn_number}
                     </TableCell>
                     <TableCell className="text-xs text-muted-foreground">
                       {formatTime(move.created_at)}
                     </TableCell>
                     <TableCell className="font-mono text-xs">
                       {formatWallet(move.wallet)}
                     </TableCell>
                     <TableCell className={cn("text-xs font-medium", getTypeColor(type))}>
                       {type}
                     </TableCell>
                     <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                       {details.join(" • ") || "—"}
                     </TableCell>
                   </TableRow>
                 );
               })}
             </TableBody>
           </Table>
         </ScrollArea>
       </div>
     </div>
   );
 }
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";

const Support = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card className="bg-background/80 border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-cinzel text-primary text-center">
            Support & Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-foreground/80 text-center">
            Have questions, feedback, or need assistance? We're here to help.
          </p>
          
          <div className="flex flex-col items-center gap-4 py-6">
            <Mail className="w-12 h-12 text-primary" />
            <a 
              href="mailto:1mgaming@proton.me" 
              className="text-xl text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              1mgaming@proton.me
            </a>
          </div>

          <div className="text-center text-foreground/60 text-sm space-y-2">
            <p>Response time: Within 24-48 hours</p>
            <p>For urgent matters, please include "URGENT" in your subject line.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Support;

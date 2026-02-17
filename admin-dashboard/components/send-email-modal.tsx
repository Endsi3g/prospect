"use client"

import * as React from "react"
import { IconMail, IconSend, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestApi } from "@/lib/api"

interface SendEmailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  leadName: string
  leadEmail: string
  defaultSubject?: string
  defaultBody?: string
}

export function SendEmailModal({ 
  open, 
  onOpenChange, 
  leadId, 
  leadName, 
  leadEmail,
  defaultSubject = "",
  defaultBody = ""
}: SendEmailModalProps) {
  const [subject, setSubject] = React.useState("")
  const [body, setBody] = React.useState("")
  const [isSending, setIsSending] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setSubject(defaultSubject || `Suivi Prospect - ${leadName}`)
      setBody(defaultBody || `Bonjour ${leadName.split(' ')[0]},

`)
    }
  }, [open, leadName, defaultSubject, defaultBody])

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Sujet et message requis.")
      return
    }

    setIsSending(true)
    try {
      await requestApi(`/api/v1/admin/leads/${leadId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      })
      toast.success("Email envoyé avec succès !")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'envoi.")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconMail className="size-5 text-primary" />
            Envoyer un email à {leadName}
          </DialogTitle>
          <DialogDescription>
            L&apos;email sera envoyé via votre configuration SMTP et enregistré dans l&apos;historique.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="to">Destinataire</Label>
            <Input id="to" value={leadEmail} disabled className="bg-muted opacity-70" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Sujet</Label>
            <Input 
              id="subject" 
              placeholder="Objet du message" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <textarea
              id="message"
              className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Rédigez votre message ici..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <>
                <IconLoader2 className="mr-2 size-4 animate-spin" />
                Envoi...
              </>
            ) : (
              <>
                <IconSend className="mr-2 size-4" />
                Envoyer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

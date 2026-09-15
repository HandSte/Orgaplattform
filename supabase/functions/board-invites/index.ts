import { withSupabase } from 'npm:@supabase/server';
import { createClient } from 'npm:@supabase/supabase-js@2';

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeNextOrigin(req: Request) {
  return (req.headers.get('Origin') || 'https://orgaplattform.vercel.app').replace(/\/$/, '');
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    try {
      const body = await req.json();
      const userId = ctx.userClaims?.id;
      const userEmail = ctx.userClaims?.email;
      if (!userId || !userEmail) return Response.json({ error: 'Ungültige Sitzung.' }, { status: 401 });

      if (body.action === 'create') {
        const { board_id, email, role = 'member' } = body;
        if (!board_id || !email) return Response.json({ error: 'Board und E-Mail sind erforderlich.' }, { status: 400 });
        const normalizedEmail = String(email).trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return Response.json({ error: 'Ungültige E-Mail-Adresse.' }, { status: 400 });
        if (!['admin', 'member', 'viewer'].includes(role)) return Response.json({ error: 'Ungültige Rolle.' }, { status: 400 });

        const { data: board } = await ctx.supabaseAdmin.from('boards').select('id,owner_id').eq('id', board_id).maybeSingle();
        if (!board) return Response.json({ error: 'Board nicht gefunden.' }, { status: 404 });
        if (board.owner_id !== userId) {
          const { data: membership } = await ctx.supabaseAdmin.from('board_members').select('role').eq('board_id', board_id).eq('user_id', userId).maybeSingle();
          if (!membership || !['owner', 'admin'].includes(membership.role)) return Response.json({ error: 'Keine Berechtigung.' }, { status: 403 });
        }

        const { data: existingUsers } = await ctx.supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existingUser = existingUsers?.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
        if (existingUser) {
          const { data: existingMember } = await ctx.supabaseAdmin.from('board_members').select('user_id').eq('board_id', board_id).eq('user_id', existingUser.id).maybeSingle();
          if (existingMember) return Response.json({ error: 'Diese Person ist bereits Mitglied des Boards.' }, { status: 409 });
        }

        const rawToken = randomToken();
        const tokenHash = await sha256(rawToken);
        await ctx.supabaseAdmin.from('board_invitations').delete().eq('board_id', board_id).eq('email', normalizedEmail).is('accepted_at', null);
        const { data: invitation, error: invitationError } = await ctx.supabaseAdmin.from('board_invitations').insert({ board_id, email: normalizedEmail, role, created_by: userId, token_hash: tokenHash }).select('id,expires_at').single();
        if (invitationError) return Response.json({ error: invitationError.message }, { status: 500 });

        const inviteUrl = `${safeNextOrigin(req)}/invite/${rawToken}`;
        let mailError: { message?: string } | null = null;
        if (!existingUser) {
          const result = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, { redirectTo: inviteUrl, data: { board_id, board_role: role } });
          mailError = result.error;
        } else {
          const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
          const publishableKey = publishableKeys.default;
          if (!publishableKey) throw new Error('Publishable Supabase-Schlüssel fehlt.');
          const publicClient = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
          const result = await publicClient.auth.signInWithOtp({ email: normalizedEmail, options: { shouldCreateUser: false, emailRedirectTo: inviteUrl } });
          mailError = result.error;
        }

        if (mailError) {
          await ctx.supabaseAdmin.from('board_invitations').delete().eq('id', invitation.id);
          return Response.json({ error: `Einladungs-E-Mail konnte nicht versendet werden: ${mailError.message ?? 'Unbekannter Fehler'}` }, { status: 500 });
        }
        return Response.json({ sent: true, expires_at: invitation.expires_at });
      }

      if (body.action === 'accept') {
        const rawToken = String(body.token ?? '').trim();
        if (!rawToken) return Response.json({ error: 'Einladungslink fehlt.' }, { status: 400 });
        const tokenHash = await sha256(rawToken);
        const { data: invitation } = await ctx.supabaseAdmin.from('board_invitations').select('id,board_id,email,role,expires_at,accepted_at').eq('token_hash', tokenHash).maybeSingle();
        if (!invitation) return Response.json({ error: 'Einladung nicht gefunden.' }, { status: 404 });
        if (invitation.accepted_at) return Response.json({ error: 'Diese Einladung wurde bereits verwendet.' }, { status: 409 });
        if (new Date(invitation.expires_at).getTime() < Date.now()) return Response.json({ error: 'Diese Einladung ist abgelaufen.' }, { status: 410 });
        if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) return Response.json({ error: `Die Einladung ist für ${invitation.email} bestimmt. Bitte mit dieser E-Mail-Adresse anmelden.` }, { status: 403 });
        const { error: memberError } = await ctx.supabaseAdmin.from('board_members').upsert({ board_id: invitation.board_id, user_id: userId, role: invitation.role }, { onConflict: 'board_id,user_id' });
        if (memberError) return Response.json({ error: memberError.message }, { status: 500 });
        const { error: acceptError } = await ctx.supabaseAdmin.from('board_invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invitation.id).is('accepted_at', null);
        if (acceptError) return Response.json({ error: acceptError.message }, { status: 500 });
        return Response.json({ board_id: invitation.board_id });
      }

      return Response.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unbekannter Fehler.' }, { status: 500 });
    }
  }),
};

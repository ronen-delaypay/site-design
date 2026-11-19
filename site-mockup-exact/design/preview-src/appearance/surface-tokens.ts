// Shared appearance values for pages, panels and dialogs. No product behavior.
export const surfaceTokens={
 canvas:'#f5f6fb',paper:'#f8faff',tint:'#f0f5fd',field:'#fcfdff',
 ink:'#24283f',muted:'#606a80',line:'#dce4f0',lineStrong:'#c9d3e5',blue:'#2f6feb',
 radius:20,fieldRadius:12,
 shadow:'0 8px 30px -22px rgba(59,80,126,.22)',
 dialogShadow:'0 24px 70px -25px rgba(38,62,102,.28)',
 backdrop:'rgba(22,44,73,.56)',
} as const;
export const surfaceVariables={
 '--dp-canvas':surfaceTokens.canvas,'--dp-paper':surfaceTokens.paper,'--dp-tint':surfaceTokens.tint,
 '--dp-field':surfaceTokens.field,'--dp-ink':surfaceTokens.ink,'--dp-muted':surfaceTokens.muted,
 '--dp-line':surfaceTokens.line,'--dp-line-strong':surfaceTokens.lineStrong,'--dp-blue':surfaceTokens.blue,
 '--dp-surface-radius':surfaceTokens.radius+'px','--dp-field-radius':surfaceTokens.fieldRadius+'px',
 '--dp-surface-shadow':surfaceTokens.shadow,'--dp-dialog-shadow':surfaceTokens.dialogShadow,
 '--dp-dialog-backdrop':surfaceTokens.backdrop,
};

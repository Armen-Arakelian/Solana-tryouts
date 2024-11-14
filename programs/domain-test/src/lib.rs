use anchor_lang::prelude::*;

declare_id!("GsNNozDfJPnQNRHsDXZKcECg5yYrUna6Td8rYb1otJCu");

#[program]
mod domain_test {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let program_info = &mut ctx.accounts.program_info;
        require!(!program_info.initialized, Error::AlreadyInitialized);
        program_info.initialized = true;
        program_info.id = 0;
        program_info.bump = ctx.bumps.program_info;

        Ok(())
    }

    pub fn create_domain(ctx: Context<CreateDomain>, domain_type: u8, name: String) -> Result<()> {
        let domain = &mut ctx.accounts.domain;
        let program_info = &mut ctx.accounts.program_info;

        let _ = program_info.increment();

        domain.owner = *ctx.accounts.owner.key;
        domain.name = name;
        domain.dom_type = domain_type;

        msg!("Emitting DomainCreated event");
        emit_cpi!(DomainCreated {
            id: program_info.id,
            owner: domain.owner,
            name: domain.name.clone(),
            dom_type: domain.dom_type,
        });
        msg!("DomainCreated event emitted");

        Ok(())
    }

    pub fn update_domain(ctx: Context<UpdateDomain>, id: u64, domain_type: u8) -> Result<()> {
        let domain = &mut ctx.accounts.domain;

        domain.dom_type = domain_type;

        emit_cpi!(DomainUpdated {
            id,
            dom_type: domain_type,
        });

        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct ProgramInfo {
    pub id: u64,
    initialized: bool,
    bump: u8,
}

impl ProgramInfo {
    pub fn increment(&mut self) -> Result<()> {
        self.id += 1;

        Ok(())
    }
    
}

#[account]
pub struct Domain {            
    pub owner: Pubkey,          
    pub name: String,
    pub dom_type: u8,           
}

impl Domain {
    pub fn calculate_size(len: usize) -> usize {
        // 8 bytes (discriminator) + 8 bytes (id) + 32 bytes (owner) + 4 bytes (string length prefix) + name length
        8 + 32 + (4 + len) + 1
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = payer, 
        space = 8 + ProgramInfo::INIT_SPACE,
        seeds = [b"program_info".as_ref()],
        bump
    )]
    pub program_info: Account<'info, ProgramInfo>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(domain_type: u8, name: String)]
pub struct CreateDomain<'info> {
    #[account(
        mut,
        seeds = [b"program_info".as_ref()],
        bump
    )]
    pub program_info: Account<'info, ProgramInfo>,
    #[account(
        init,
        payer = payer,
        space = Domain::calculate_size(name.len()),
        seeds = [program_info.id.to_le_bytes().as_ref()],
        bump
    )]
    pub domain: Account<'info, Domain>,  
    #[account(mut)]
    pub payer: Signer<'info>,    
    pub owner: Signer<'info>,        
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(id: u64)]
pub struct UpdateDomain<'info> {
    #[account(
        mut,
        seeds = [b"program_info".as_ref()],
        bump
    )]
    pub program_info: Account<'info, ProgramInfo>,
    #[account(mut)]
    pub domain: Account<'info, Domain>,
}

#[error_code]
pub enum Error {
    #[msg("Program is already initialized")]
    AlreadyInitialized,
}

#[event]
struct DomainCreated {
    id: u64,
    owner: Pubkey,
    name: String,
    dom_type: u8,
}

#[event] 
struct DomainUpdated {
    id: u64,
    dom_type: u8,
}








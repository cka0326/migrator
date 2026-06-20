libname raw  "/data/raw";
libname ins  "/data/curated";
libname mart "/data/mart";

data ins.party;
    set raw.cust(keep=cust_id first_name last_name birth_dt org_flag tax_id);
    length party_name $200 party_type $12;
    party_id      = cust_id;
    party_name    = catx(' ', first_name, last_name);
    if org_flag = 1 then party_type = 'ORG';
    else party_type = 'PERSON';
    date_of_birth = birth_dt;
    rename tax_id = tax_identifier;
run;

data ins.policy;
    set raw.pol;
    length policy_status $12;
    policy_id       = pol_sk;
    policy_number   = pol_no;
    cust_id         = insured_id;
    customer_id     = insured_id;
    effective_date  = input(eff_dt, yymmdd10.);
    expiration_date = input(exp_dt, yymmdd10.);
    term_months     = intck('month', effective_date, expiration_date);
    written_premium = wp_amt;
    if status_cd = 'A' then policy_status = 'INFORCE';
    else if status_cd = 'C' then policy_status = 'CANCELLED';
    else policy_status = 'EXPIRED';
run;

proc sql;
    create table ins.coverage as
    select c.cov_sk                     as coverage_id,
           p.policy_id                  as policy_id,
           c.cov_code                   as coverage_code,
           c.limit_amt                  as limit_amount,
           c.deductible_amt             as deductible_amount,
           c.base_prem * c.rating_factor as coverage_premium
    from   raw.cov as c
    inner join ins.policy as p
      on   c.pol_sk = p.policy_id;
quit;

proc sql;
    create table ins.insured_location as
    select l.loc_sk      as location_id,
           p.policy_id   as policy_id,
           l.addr1       as address_line1,
           l.city        as city,
           l.state_cd    as state,
           l.zip         as postal_code,
           l.constr_type as construction_type,
           l.yr_built    as year_built,
           l.tiv_amt     as tiv
    from   raw.loc as l
    inner join ins.policy as p
      on   l.pol_sk = p.policy_id;
quit;

data claim_stage;
    set raw.clm;
    length claim_status $12;
    claim_id      = clm_sk;
    claim_number  = clm_no;
    policy_id     = pol_sk;
    coverage_id   = cov_sk;
    adjuster_id   = adjuster_id;
    loss_date     = input(loss_dt, yymmdd10.);
    report_date   = input(rpt_dt,  yymmdd10.);
    if clm_status = 'O' then claim_status = 'OPEN';
    else claim_status = 'CLOSED';
    cause_of_loss   = peril_desc;
    reserve_amount  = case_reserve;
run;

proc sql;
    create table ins.claim as
    select s.claim_id,
           s.claim_number,
           s.policy_id,
           s.coverage_id,
           s.loss_date,
           s.report_date,
           s.claim_status,
           s.cause_of_loss,
           s.reserve_amount,
           a.adjuster_name as adjuster_name
    from   claim_stage as s
    left join raw.adj as a
      on   s.adjuster_id = a.adjuster_id;
quit;

data ins.claim_transaction;
    set raw.pay;
    claim_txn_id   = pay_sk;
    claim_id       = clm_sk;
    txn_type       = pay_type;
    txn_date       = input(pay_dt, yymmdd10.);
    paid_amount    = pay_amt;
    reserve_change = rsv_delta;
run;

proc sql;
    create table mart.policy_premium_summary as
    select p.policy_id                              as policy_id,
           p.policy_number                          as policy_number,
           sum(p.written_premium)                   as total_written_premium,
           sum(cov.coverage_premium)                as total_coverage_premium,
           sum(loc.tiv)                             as total_tiv,
           count(distinct clm.claim_id)             as claim_count,
           sum(ct.paid_amount + ct.reserve_change)  as total_incurred
    from   ins.policy             as p
    left join ins.coverage          as cov on cov.policy_id = p.policy_id
    left join ins.insured_location  as loc on loc.policy_id = p.policy_id
    left join ins.claim             as clm on clm.policy_id = p.policy_id
    left join ins.claim_transaction as ct  on ct.claim_id   = clm.claim_id
    group by p.policy_id, p.policy_number;
quit;

proc sql;
    create table mart.claims_kpi as
    select clm.policy_id                as policy_id,
           clm.cause_of_loss            as cause_of_loss,
           count(distinct clm.claim_id) as claim_count,
           sum(ct.paid_amount)          as paid_to_date,
           avg(ct.paid_amount)          as avg_payment
    from   ins.claim as clm
    left join ins.claim_transaction as ct
      on   ct.claim_id = clm.claim_id
    group by clm.policy_id, clm.cause_of_loss;
quit;

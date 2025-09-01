import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DefaiAppFactory } from "../target/types/defai_app_factory";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { assert } from "chai";

describe("defai_app_factory", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DefaiAppFactory as Program<DefaiAppFactory>;
  const wallet = provider.wallet as anchor.Wallet;

  // Test accounts
  let defaiMint: PublicKey;
  let masterCollection: PublicKey;
  let treasury: Keypair;
  let appFactory: PublicKey;
  let appFactoryBump: number;
  
  // App registration accounts
  let creator: Keypair;
  let sftMint: PublicKey;
  let appRegistration: PublicKey;
  let appRegistrationBump: number;
  const appId = new anchor.BN(0);
  
  // User accounts
  let user: Keypair;
  let userDefaiAta: PublicKey;
  let userSftAta: PublicKey;
  let userAppAccess: PublicKey;

  before(async () => {
    // Setup test accounts
    treasury = Keypair.generate();
    creator = Keypair.generate();
    user = Keypair.generate();

    // Airdrop SOL
    await provider.connection.requestAirdrop(treasury.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(creator.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 10 * LAMPORTS_PER_SOL);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create DEFAI mint (6 decimals)
    defaiMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    // Create master collection mint
    masterCollection = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0
    );

    // Mint 1 to master collection to make it valid
    const masterCollectionAta = await createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      masterCollection,
      wallet.publicKey
    );
    
    await mintTo(
      provider.connection,
      wallet.payer,
      masterCollection,
      masterCollectionAta,
      wallet.publicKey,
      1
    );

    // Derive app factory PDA
    [appFactory, appFactoryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("app_factory")],
      program.programId
    );
  });

  describe("Initialize", () => {
    it("Should initialize app factory", async () => {
      const platformFeeBps = 2000; // 20%

      await program.methods
        .initializeAppFactory(platformFeeBps)
        .accounts({
          appFactory,
          authority: wallet.publicKey,
          defaiMint,
          treasury: treasury.publicKey,
          masterCollection,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const appFactoryAccount = await program.account.appFactory.fetch(appFactory);
      assert.equal(appFactoryAccount.authority.toBase58(), wallet.publicKey.toBase58());
      assert.equal(appFactoryAccount.defaiMint.toBase58(), defaiMint.toBase58());
      assert.equal(appFactoryAccount.treasury.toBase58(), treasury.publicKey.toBase58());
      assert.equal(appFactoryAccount.platformFeeBps, platformFeeBps);
      assert.equal(appFactoryAccount.totalApps.toNumber(), 0);
    });

    it("Should reject invalid platform fee", async () => {
      const invalidFeeBps = 10001; // > 100%
      
      try {
        await program.methods
          .initializeAppFactory(invalidFeeBps)
          .accounts({
            appFactory: Keypair.generate().publicKey,
            authority: wallet.publicKey,
            defaiMint,
            treasury: treasury.publicKey,
            masterCollection,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.include(err.toString(), "InvalidPlatformFee");
      }
    });
  });

  describe("Register App", () => {
    before(async () => {
      // Derive app registration PDA
      [appRegistration, appRegistrationBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("app_registration"), appId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Create SFT mint with app registration as authority
      sftMint = await createMint(
        provider.connection,
        creator,
        appRegistration,
        appRegistration,
        0
      );
    });

    it("Should register an app with valid SFT", async () => {
      const price = new anchor.BN(100_000_000); // 100 DEFAI
      const maxSupply = new anchor.BN(1000);
      const metadataUri = "ipfs://QmTest123";

      await program.methods
        .registerApp(price, maxSupply, metadataUri)
        .accounts({
          appFactory,
          appRegistration,
          sftMint,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const appRegAccount = await program.account.appRegistration.fetch(appRegistration);
      assert.equal(appRegAccount.appId.toNumber(), 0);
      assert.equal(appRegAccount.creator.toBase58(), creator.publicKey.toBase58());
      assert.equal(appRegAccount.sftMint.toBase58(), sftMint.toBase58());
      assert.equal(appRegAccount.price.toNumber(), price.toNumber());
      assert.equal(appRegAccount.maxSupply.toNumber(), maxSupply.toNumber());
      assert.equal(appRegAccount.currentSupply.toNumber(), 0);
      assert.equal(appRegAccount.isActive, true);
      assert.equal(appRegAccount.metadataUri, metadataUri);
    });

    it("Should reject invalid SFT mint authority", async () => {
      // Create SFT with wrong authority
      const invalidSftMint = await createMint(
        provider.connection,
        creator,
        creator.publicKey, // Wrong authority
        creator.publicKey,
        0
      );

      const [invalidAppReg] = PublicKey.findProgramAddressSync(
        [Buffer.from("app_registration"), new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      try {
        await program.methods
          .registerApp(
            new anchor.BN(100_000_000),
            new anchor.BN(1000),
            "ipfs://QmInvalid"
          )
          .accounts({
            appFactory,
            appRegistration: invalidAppReg,
            sftMint: invalidSftMint,
            creator: creator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.include(err.toString(), "InvalidMintAuthority");
      }
    });
  });

  describe("Purchase App", () => {
    before(async () => {
      // Create user's DEFAI ATA and mint tokens
      userDefaiAta = await createAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        defaiMint,
        user.publicKey
      );

      await mintTo(
        provider.connection,
        wallet.payer,
        defaiMint,
        userDefaiAta,
        wallet.publicKey,
        1_000_000_000 // 1000 DEFAI
      );

      // Create user's SFT ATA
      userSftAta = await createAssociatedTokenAccount(
        provider.connection,
        user,
        sftMint,
        user.publicKey
      );

      // Create creator's DEFAI ATA
      const creatorDefaiAta = await createAssociatedTokenAccount(
        provider.connection,
        creator,
        defaiMint,
        creator.publicKey
      );

      // Create treasury's DEFAI ATA
      const treasuryDefaiAta = await createAssociatedTokenAccount(
        provider.connection,
        treasury,
        defaiMint,
        treasury.publicKey
      );

      // Derive user app access PDA
      [userAppAccess] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_app_access"),
          user.publicKey.toBuffer(),
          appId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
    });

    it("Should purchase app with sufficient balance", async () => {
      const initialUserBalance = (await getAccount(provider.connection, userDefaiAta)).amount;

      await program.methods
        .purchaseAppAccessV2(appId)
        .accounts({
          appFactory,
          appRegistration,
          userAppAccess,
          sftMint,
          userSftAta,
          userDefaiAta,
          creatorDefaiAta: await createAssociatedTokenAccount(
            provider.connection,
            user,
            defaiMint,
            creator.publicKey
          ),
          treasuryDefaiAta: await createAssociatedTokenAccount(
            provider.connection,
            user,
            defaiMint,
            treasury.publicKey
          ),
          user: user.publicKey,
          defaiMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      // Check SFT was minted
      const userSftAccount = await getAccount(provider.connection, userSftAta);
      assert.equal(userSftAccount.amount.toString(), "1");

      // Check user app access was created
      const userAppAccessAccount = await program.account.userAppAccess.fetch(userAppAccess);
      assert.equal(userAppAccessAccount.user.toBase58(), user.publicKey.toBase58());
      assert.equal(userAppAccessAccount.appId.toNumber(), appId.toNumber());

      // Check supply was updated
      const appRegAccount = await program.account.appRegistration.fetch(appRegistration);
      assert.equal(appRegAccount.currentSupply.toNumber(), 1);
    });

    it("Should reject purchase with insufficient balance", async () => {
      const poorUser = Keypair.generate();
      await provider.connection.requestAirdrop(poorUser.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const poorUserDefaiAta = await createAssociatedTokenAccount(
        provider.connection,
        poorUser,
        defaiMint,
        poorUser.publicKey
      );

      // Mint only 10 DEFAI (not enough for 100 DEFAI price)
      await mintTo(
        provider.connection,
        wallet.payer,
        defaiMint,
        poorUserDefaiAta,
        wallet.publicKey,
        10_000_000
      );

      const [poorUserAppAccess] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_app_access"),
          poorUser.publicKey.toBuffer(),
          appId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );

      try {
        await program.methods
          .purchaseAppAccessV2(appId)
          .accounts({
            appFactory,
            appRegistration,
            userAppAccess: poorUserAppAccess,
            sftMint,
            userSftAta: await createAssociatedTokenAccount(
              provider.connection,
              poorUser,
              sftMint,
              poorUser.publicKey
            ),
            userDefaiAta: poorUserDefaiAta,
            creatorDefaiAta: await createAssociatedTokenAccount(
              provider.connection,
              poorUser,
              defaiMint,
              creator.publicKey
            ),
            treasuryDefaiAta: await createAssociatedTokenAccount(
              provider.connection,
              poorUser,
              defaiMint,
              treasury.publicKey
            ),
            user: poorUser.publicKey,
            defaiMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([poorUser])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.include(err.toString(), "InsufficientBalance");
      }
    });
  });

  describe("Update App", () => {
    it("Should update app metadata by creator", async () => {
      const newPrice = new anchor.BN(150_000_000); // 150 DEFAI
      const newMetadataUri = "ipfs://QmUpdated456";

      await program.methods
        .updateAppMetadata(appId, newMetadataUri, newPrice)
        .accounts({
          appRegistration,
          creator: creator.publicKey,
        })
        .signers([creator])
        .rpc();

      const appRegAccount = await program.account.appRegistration.fetch(appRegistration);
      assert.equal(appRegAccount.price.toNumber(), newPrice.toNumber());
      assert.equal(appRegAccount.metadataUri, newMetadataUri);
    });

    it("Should reject update from non-creator", async () => {
      try {
        await program.methods
          .updateAppMetadata(appId, "ipfs://QmHacker", new anchor.BN(1))
          .accounts({
            appRegistration,
            creator: user.publicKey, // Wrong signer
          })
          .signers([user])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.include(err.toString(), "UnauthorizedCreator");
      }
    });
  });

  describe("Authority Transfer", () => {
    let newAuthority: Keypair;

    before(() => {
      newAuthority = Keypair.generate();
    });

    it("Should initiate authority transfer", async () => {
      await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          appFactory,
          authority: wallet.publicKey,
        })
        .rpc();

      const appFactoryAccount = await program.account.appFactory.fetch(appFactory);
      assert.equal(
        appFactoryAccount.pendingAuthority?.toBase58(),
        newAuthority.publicKey.toBase58()
      );
    });

    it("Should accept authority transfer", async () => {
      await program.methods
        .acceptAuthority()
        .accounts({
          appFactory,
          newAuthority: newAuthority.publicKey,
        })
        .signers([newAuthority])
        .rpc();

      const appFactoryAccount = await program.account.appFactory.fetch(appFactory);
      assert.equal(
        appFactoryAccount.authority.toBase58(),
        newAuthority.publicKey.toBase58()
      );
      assert.equal(appFactoryAccount.pendingAuthority, null);
    });
  });

  describe("Reviews", () => {
    it("Should submit a review", async () => {
      const rating = 5;
      const commentCid = "QmReview123";

      const [review] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("app_review"),
          user.publicKey.toBuffer(),
          appId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );

      await program.methods
        .submitReview(appId, rating, commentCid)
        .accounts({
          review,
          userAppAccess,
          user: user.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const reviewAccount = await program.account.appReview.fetch(review);
      assert.equal(reviewAccount.appId.toNumber(), appId.toNumber());
      assert.equal(reviewAccount.reviewer.toBase58(), user.publicKey.toBase58());
      assert.equal(reviewAccount.rating, rating);
      assert.equal(reviewAccount.commentCid, commentCid);
    });

    it("Should reject review from non-owner", async () => {
      const nonOwner = Keypair.generate();
      await provider.connection.requestAirdrop(nonOwner.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const [review] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("app_review"),
          nonOwner.publicKey.toBuffer(),
          appId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );

      const [nonOwnerAppAccess] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_app_access"),
          nonOwner.publicKey.toBuffer(),
          appId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );

      try {
        await program.methods
          .submitReview(appId, 3, "QmFakeReview")
          .accounts({
            review,
            userAppAccess: nonOwnerAppAccess,
            user: nonOwner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([nonOwner])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.include(err.toString(), "AccountNotInitialized");
      }
    });
  });
});
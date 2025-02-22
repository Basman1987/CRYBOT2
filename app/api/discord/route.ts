import { ethers } from "ethers"
import { NextResponse } from "next/server"

// Constants remain the same
const TOKEN_ADDRESS = "0xB770074eA2A8325440798fDF1c29B235b31922Ae"
const ROUTER_ADDRESS = "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae"
const WCRO = "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23"
const USDC = "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59"

const ROUTER_ABI = ["function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"]
const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"]

export const dynamic = "force-dynamic"

// Function to format very small numbers
function formatSmallNumber(num: number): string {
  if (num === 0) return "0.000000"

  const numStr = num.toString()
  if (numStr.includes("e-")) {
    // Handle scientific notation
    const [base, exponent] = numStr.split("e-")
    const zeros = Number.parseInt(exponent) - 1
    return `0.${"0".repeat(zeros)}${base.replace(".", "")}`
  }

  // For regular decimal numbers
  const [whole, decimal] = numStr.split(".")
  if (decimal) {
    // Count leading zeros in decimal
    let leadingZeros = 0
    for (let i = 0; i < decimal.length; i++) {
      if (decimal[i] === "0") leadingZeros++
      else break
    }
    return `0.(${leadingZeros})${decimal.slice(leadingZeros)}`
  }

  return numStr
}

export async function GET() {
  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
    return NextResponse.json({ error: "Missing environment variables" }, { status: 500 })
  }

  try {
    const provider = new ethers.JsonRpcProvider("https://evm.cronos.org/")
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider)
    const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider)

    const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()])

    const amountIn = ethers.parseUnits("1", decimals)
    const amounts = await router.getAmountsOut(amountIn, [TOKEN_ADDRESS, WCRO, USDC])
    const price = Number(ethers.formatUnits(amounts[2], 6))

    // Format the price using our new function
    const formattedPrice = formatSmallNumber(price)

    // Prepare Discord message with formatted price
    const message = {
      content: `
📊 **${symbol} Price Update**
💵 Current Price: $${formattedPrice}
⏰ Updated: ${new Date().toLocaleString()}
🔗 Contract: \`${TOKEN_ADDRESS}\`
      `,
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${process.env.DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error("Discord API Response:", errorData)
      throw new Error(`Discord API error: ${response.status} ${response.statusText} - ${errorData}`)
    }

    return NextResponse.json({
      success: true,
      message: "Price update sent successfully",
      price: formattedPrice,
    })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}


# Is deno selected? It's the default anyways; none of this matters yet.
if [[ -z "$1" || "$1" == "deno" ]]; then
    # Make sure deno is on the system
    if command -v deno > /dev/null 2>&1 && [[ -z "$1" || "$1" == "deno" ]]; then
        # Kill deno if it is already running 
        PREV_DENO_PROC_ID=$(pgrep -x "deno")
        # FIXME: This code assumes that any deno process is for Dispenser. Somehow only check the one for Dispenser.
        if [ -f "/proc/$PREV_DENO_PROC_ID/exe" ]; then
            while [[ ! "$ANS" =~ ^[yn]$ ]]; do
                read -p "Deno is already running! Would you like to restart it? (y/n) " ANS

                if [[ ! "$ANS" =~ ^[yn]$ ]]; then
                    echo "Invalid input! Please enter a \"y\" for yes or a \"n\" for no."
                fi
            done

            if [ "$ANS" = "y" ]; then
                echo "Killing deno"
                pkill deno
            elif [ "$ANS" = "n" ]; then
                echo "It seems like you were mistaken. The other deno process is $PREV_DENO_PROC_ID. Goodbye!"
                exit 0
            fi
        fi

        LOGS=logs/
        # Make the log directory if it doesn't already exist
        if [ ! -d $LOGS ]; then
            mkdir -p $LOGS
        fi

        echo "Starting deno"
        nohup deno run --allow-all --unstable-kv src/app.ts &
    else
        echo "Deno is not installed on your system. Please install it!"
        exit 1
    fi
fi
# TODO: If Deno isn't on the system, try other runtimes. Make sure to simply run the npm script in the case of NodeJS. 